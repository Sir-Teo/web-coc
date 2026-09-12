import { it, expect } from 'vitest';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { sweeperAsset, sweeperTexture } from '../src/game/air-control-art';
import { asset, buildingTexture } from '../src/game/data';

it('ships 32 distinct transparent Sweeper views with clear cell borders', async () => {
  const hashes = new Set<string>();
  for (let level = 1; level <= 4; level++)
    for (let direction = 0; direction < 8; direction++) {
      expect(buildingTexture('airsweeper', level, direction)).toBe(
        sweeperTexture(level, direction),
      );
      if (direction === 0) expect(asset('airsweeper', level)).toBe(sweeperAsset(level));
      const { data, info } = await sharp(`public${sweeperAsset(level, direction)}`)
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect([info.width, info.height, info.channels]).toEqual([384, 384, 4]);
      let opaque = 0;
      for (let y = 0; y < 384; y++)
        for (let x = 0; x < 384; x++) {
          const alpha = data[(y * 384 + x) * 4 + 3];
          if (x < 8 || x >= 376 || y < 8 || y >= 376) expect(alpha).toBe(0);
          if (alpha > 250) opaque++;
        }
      expect(opaque / (384 * 384)).toBeGreaterThan(0.15);
      expect(opaque / (384 * 384)).toBeLessThan(0.7);
      hashes.add(createHash('sha256').update(data).digest('hex'));
    }
  expect(hashes.size).toBe(32);
});
