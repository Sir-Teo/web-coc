import { it, expect } from 'vitest';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { sweeperAsset, sweeperTexture } from '../src/game/air-control-art';
import native from '../reference/air-sweeper/native.json';
import { asset, buildingTexture } from '../src/game/data';

it('ships 56 distinct transparent Sweeper views with clear cell borders', async () => {
  const hashes = new Set<string>();
  for (let level = 1; level <= 7; level++)
    for (let direction = 0; direction < 8; direction++) {
      expect(buildingTexture('airsweeper', level, direction)).toBe(
        sweeperTexture(level, direction),
      );
      if (direction === 0) expect(asset('airsweeper', level)).toBe(sweeperAsset(level));
      const { data, info } = await sharp(`public${sweeperAsset(level, direction)}`)
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect([info.width, info.height, info.channels]).toEqual([284, 330, 4]);
      let opaque = 0,
        borderAlpha = 0;
      for (let y = 0; y < 330; y++)
        for (let x = 0; x < 284; x++) {
          const alpha = data[(y * 284 + x) * 4 + 3];
          if (x < 8 || x >= 276 || y < 8 || y >= 322) borderAlpha = Math.max(borderAlpha, alpha);
          if (alpha > 250) opaque++;
        }
      expect(borderAlpha).toBe(0);
      expect(opaque).toBeGreaterThan(0);
      const hash = createHash('sha256').update(data).digest('hex');
      expect(hash).toBe(
        native.previews[`${level}-${direction}` as keyof typeof native.previews].rgbaSha256,
      );
      hashes.add(hash);
    }
  expect(hashes.size).toBe(56);
});
