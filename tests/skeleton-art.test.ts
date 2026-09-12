import { it, expect } from 'vitest';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { skeletonAsset, skeletonTrapAsset, skeletonTrapTexture } from '../src/game/skeleton-art';
import { asset, buildingTexture } from '../src/game/data';
it('ships three distinct transparent coffin states with clear framing', async () => {
  const hashes = new Set();
  for (const mode of ['ground', 'air', 'spent'] as const) {
    const file = `public${skeletonTrapAsset(mode)}`,
      m = await sharp(file).metadata();
    expect([m.width, m.height, m.hasAlpha]).toEqual([256, 256, true]);
    const data = await sharp(file).raw().toBuffer();
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 256; x++)
        if (x < 18 || x >= 238 || y < 14 || y >= 234) expect(data[(y * 256 + x) * 4 + 3]).toBe(0);
    hashes.add(createHash('sha256').update(data).digest('hex'));
  }
  expect(hashes.size).toBe(3);
  expect(asset('skeletontrap', 2, 'air')).toBe(skeletonTrapAsset('air'));
  expect(buildingTexture('skeletontrap', 2)).toBe(skeletonTrapTexture('ground'));
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
