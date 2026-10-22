import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { nativePages } from '../scripts/vite-native-pages.mjs';

const texture = 'assets/atlas.png';
const graph = {
  exports: { basic_turret_lvl1: 1, basic_turret_lvl2: 2 },
  clips: {},
  matrices: [],
  colors: [],
  textures: { 0: { path: texture, width: 64, height: 64 } },
  shapes: Object.fromEntries(
    [8, 40].map((at, i) => [
      i + 1,
      [
        [
          0,
          [
            0,
            0,
            at / 64,
            at / 64,
            4,
            0,
            (at + 4) / 64,
            at / 64,
            4,
            4,
            (at + 4) / 64,
            (at + 4) / 64,
            0,
            4,
            at / 64,
            (at + 4) / 64,
          ],
        ],
      ],
    ]),
  ),
};
const pack = {
  levels: [1, 2].map((level) => ({
    level,
    refs: { idle: { scene: 'body', export: `basic_turret_lvl${level}` } },
  })),
  scenes: { body: graph },
};
const png = (r: number, b: number) =>
  sharp({
    create: { width: 64, height: 64, channels: 4, background: { r, g: 24, b, alpha: 1 } },
  })
    .png({ compressionLevel: 0, adaptiveFiltering: false })
    .toBuffer();

async function snapshot(root: string, kind: 'pack' | 'bundled', bytes: Buffer, time: Date) {
  const dir = path.join(root, kind === 'pack' ? 'dist' : 'public');
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(path.join(dir, 'assets/village-native/tiny'), { recursive: true });
  await fs.writeFile(path.join(dir, texture), bytes);
  await fs.utimes(path.join(dir, texture), time, time);
  const plugin = nativePages();
  plugin.configResolved({
    command: 'build',
    root,
    publicDir: path.join(root, 'public'),
    build: { outDir: 'dist' },
  });
  let json: object;
  const emitted: { fileName: string; source: Buffer }[] = [];
  if (kind === 'pack') {
    const file = path.join(dir, 'assets/village-native/tiny/graph.json');
    await fs.writeFile(file, JSON.stringify(pack));
    await plugin.closeBundle();
    json = JSON.parse(await fs.readFile(file, 'utf8'));
    const textures = Object.values((json as typeof pack).scenes.body.textures);
    for (const page of textures)
      emitted.push({ fileName: page.path, source: await fs.readFile(path.join(dir, page.path)) });
  } else {
    const result = await plugin.transform.call(
      { emitFile: (file: { fileName: string; source: Buffer }) => emitted.push(file) },
      JSON.stringify(graph),
      path.join(root, 'reference/cannon/runtime.json'),
    );
    expect(result).toBeDefined();
    json = JSON.parse(result!.code);
  }
  expect(emitted).toHaveLength(2);
  emitted.sort((a, b) => a.fileName.localeCompare(b.fileName));
  return {
    json,
    paths: emitted.map((page) => page.fileName),
    hashes: emitted.map((page) => createHash('sha256').update(page.source).digest('hex')),
  };
}

for (const kind of ['pack', 'bundled'] as const) {
  it(`${kind} page URLs and bytes stay stable when copied files have different timestamps`, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'native-page-identity-'));
    try {
      const image = await png(12, 36);
      const first = await snapshot(root, kind, image, new Date('2020-01-01T00:00:00Z'));
      const second = await snapshot(root, kind, image, new Date('2030-01-01T00:00:00Z'));
      expect(second).toEqual(first);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it(`${kind} page URLs change when image bytes change with the same size and timestamp`, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'native-page-identity-'));
    try {
      const firstImage = await png(12, 36),
        secondImage = await png(36, 12);
      expect(secondImage.length).toBe(firstImage.length);
      const time = new Date('2020-01-01T00:00:00Z');
      const first = await snapshot(root, kind, firstImage, time);
      const second = await snapshot(root, kind, secondImage, time);
      expect(second.hashes).not.toEqual(first.hashes);
      expect(second.paths).not.toEqual(first.paths);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
}
