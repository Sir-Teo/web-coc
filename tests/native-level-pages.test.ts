import { afterEach, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { NativeLevelPages } from '../src/game/native-level-pages';
import { nativeMeshTexture, type NativeMeshGraph } from '../src/game/native-mesh';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function fixture(uploaded: string[] = [], failShared = false) {
  const textures = new Set(uploaded.map((id) => nativeMeshTexture('test', id)));
  const requests: string[] = [];
  let failing = failShared;
  vi.stubGlobal(
    'Image',
    class {
      src = '';
      async decode() {
        requests.push(this.src);
        if (failing && this.src === '/shared.webp') throw Error('Temporary outage');
      }
    },
  );
  const scene = {
    textures: {
      exists: (key: string) => textures.has(key),
      addImage: (key: string) => textures.add(key),
    },
  } as unknown as Phaser.Scene;
  const graph = {
    textures: {
      shared: { path: 'shared.webp', width: 4, height: 4 },
      two: { path: 'two.webp', width: 4, height: 4, levels: [2] },
      three: { path: 'three.webp', width: 4, height: 4, levels: [3] },
    },
  } as unknown as NativeMeshGraph;
  return {
    pages: new NativeLevelPages(scene, graph, 'test'),
    requests,
    restore: () => {
      failing = false;
    },
  };
}

it('keeps the fallback until a missing shared page has uploaded', async () => {
  const { pages, requests } = fixture(['two']);
  expect(pages.has(2)).toBe(false);
  await pages.prefetch([2]);
  expect(pages.has(2)).toBe(true);
  expect(pages.revision).toBe(1);
  expect(requests).toEqual(['/shared.webp']);
});

it('prefetches shared and requested level pages without loading unrelated levels', async () => {
  const { pages, requests } = fixture();
  await pages.prefetch([2, 2]);
  expect(pages.has(2)).toBe(true);
  await pages.prefetch([2]);
  expect(requests).toEqual(['/shared.webp', '/two.webp']);
});

it('retries a failed shared page immediately on reconnect', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { pages, requests, restore } = fixture(['two'], true);
  await pages.prefetch([2]);
  expect(error).toHaveBeenCalledOnce();
  expect(pages.has(2)).toBe(false);
  expect(pages.revision).toBe(0);
  restore();
  pages.retry([2], true);
  await pages.prefetch([2]);
  expect(pages.has(2)).toBe(true);
  expect(pages.revision).toBe(1);
  expect(requests).toEqual(['/shared.webp', '/shared.webp']);
});
