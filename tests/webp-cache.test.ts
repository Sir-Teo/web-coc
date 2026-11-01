import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createWebpCache } from '../scripts/webp-cache.mjs';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});
async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'crown-webp-cache-'));
  roots.push(root);
  const bytes = await sharp({
    create: { width: 4, height: 4, channels: 4, background: { r: 31, g: 63, b: 127, alpha: 0.5 } },
  })
    .webp({ lossless: true, exact: true })
    .toBuffer();
  return { root, bytes, cache: createWebpCache(root) };
}

it('encodes simultaneous identical textures once and reuses complete cached bytes', async () => {
  const { root, bytes, cache } = await setup();
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const encode = vi.fn(async () => {
    started();
    await gate;
    return bytes;
  });
  const jobs = Array.from({ length: 24 }, () => cache('shared', encode));
  try {
    await entered;
    expect(encode).toHaveBeenCalledTimes(1);
  } finally {
    release();
  }
  const outputs = await Promise.all(jobs);
  expect(outputs.every((output) => output.equals(bytes))).toBe(true);
  expect(await fs.readFile(path.join(root, 'shared.webp'))).toEqual(bytes);
  const unexpected = vi.fn(async () => {
    throw Error('Cache hit re-encoded');
  });
  expect(await createWebpCache(root)('shared', unexpected)).toEqual(bytes);
  expect(unexpected).not.toHaveBeenCalled();
});

it('keeps a partial write private while an independent builder publishes the same key', async () => {
  const { root, bytes, cache } = await setup(),
    writeFile = fs.writeFile.bind(fs);
  let release!: () => void,
    partial!: () => void,
    writes = 0;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const written = new Promise<void>((resolve) => {
    partial = resolve;
  });
  vi.spyOn(fs, 'writeFile').mockImplementation(async (file, data, options) => {
    if (++writes === 1) {
      await writeFile(file, (data as Buffer).subarray(0, Math.floor(bytes.length / 2)), options);
      partial();
      await gate;
    }
    await writeFile(file, data, options);
  });
  const first = cache('shared', async () => bytes);
  try {
    await written;
    await expect(fs.readFile(path.join(root, 'shared.webp'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    const second = await createWebpCache(root)('shared', async () => bytes);
    expect(second).toEqual(bytes);
    expect(await fs.readFile(path.join(root, 'shared.webp'))).toEqual(bytes);
  } finally {
    release();
    await first;
  }
  expect(await fs.readdir(root)).toEqual(['shared.webp']);
  expect(
    await sharp(await fs.readFile(path.join(root, 'shared.webp')))
      .raw()
      .toBuffer(),
  ).toEqual(await sharp(bytes).raw().toBuffer());
});

it('repairs a truncated legacy entry rather than shipping it as a cache hit', async () => {
  const { root, bytes, cache } = await setup();
  await fs.writeFile(path.join(root, 'broken.webp'), bytes.subarray(0, bytes.length - 1));
  const encode = vi.fn(async () => bytes);
  expect(await cache('broken', encode)).toEqual(bytes);
  expect(encode).toHaveBeenCalledTimes(1);
  expect(await fs.readFile(path.join(root, 'broken.webp'))).toEqual(bytes);
});

it('clears a failed encode and rejects incomplete encoder output before publishing', async () => {
  const { root, bytes, cache } = await setup();
  await expect(
    cache('retry', async () => {
      throw Error('Codec failed');
    }),
  ).rejects.toThrow('Codec failed');
  await expect(cache('retry', async () => bytes.subarray(0, 8))).rejects.toThrow('incomplete file');
  expect(await fs.readdir(root)).toEqual([]);
  expect(await cache('retry', async () => bytes)).toEqual(bytes);
});
