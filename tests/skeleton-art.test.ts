import { it, expect } from 'vitest';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import {
  skeletonAsset,
  skeletonTrapAsset,
  skeletonTrapTexture,
  skeletonTrapArt,
  skeletonTrapFrame,
} from '../src/game/skeleton-art';
import { asset, buildingTexture } from '../src/game/data';
it('selects the native art tier for each supported level without scaling its footprint', () => {
  expect(asset('skeletontrap', 2, 'air')).toBe(skeletonTrapAsset('air'));
  expect(buildingTexture('skeletontrap', 2)).toBe(skeletonTrapTexture('ground'));
  expect(asset('skeletontrap', 4, 'air')).toBe(skeletonTrapAsset('air', 3));
  expect(buildingTexture('skeletontrap', 4)).toBe(skeletonTrapTexture('ground', 3));
  expect(skeletonTrapArt(2)).toEqual(skeletonTrapArt(1));
  expect(skeletonTrapArt(4)).toEqual(skeletonTrapArt(3));
  expect(skeletonTrapArt(1).width).toBe(skeletonTrapArt(3).width);
  const state = { activatedAt: 0, resolved: false, targetId: 1, x: 1, y: 1 };
  expect(skeletonTrapFrame(3, 'ground', undefined, 0)).toBe(0);
  expect(skeletonTrapFrame(3, 'air', undefined, 0)).toBe(1);
  expect(skeletonTrapFrame(3, 'ground', state, 0)).toBe(3); // Native empty start.
  expect(skeletonTrapFrame(3, 'ground', state, 19 / 24)).toBe(20);
  expect(skeletonTrapFrame(3, 'ground', state, 100)).toBe(21);
  expect(skeletonTrapFrame(3, 'ground', { ...state, spawned: 1 }, 1, true)).toBe(2);
});
it.each(['ground', 'air'] as const)(
  '%s has six distinct, fully framed transparent poses',
  async (mode) => {
    const file = `public${skeletonAsset(mode)}`,
      m = await sharp(file).metadata();
    expect([m.width, m.height, m.hasAlpha]).toEqual([768, 128, true]);
    const hashes = new Set();
    for (let i = 0; i < 6; i++) {
      const frame = sharp(file).extract({ left: i * 128, top: 0, width: 128, height: 128 });
      const data = await frame.clone().raw().toBuffer(),
        stats = await frame.stats();
      expect(stats.channels[3].min).toBe(0);
      expect(stats.channels[3].max).toBe(255);
      for (let y = 0; y < 128; y++)
        for (let x = 0; x < 128; x++)
          if (x < 8 || x >= 120 || y < 6 || y >= 114) expect(data[(y * 128 + x) * 4 + 3]).toBe(0);
      hashes.add(createHash('sha256').update(data).digest('hex'));
    }
    expect(hashes.size).toBe(6);
  },
);
