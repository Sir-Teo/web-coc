import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { asset } from '../src/game/data';
import {
  MORTAR_ART_LEVELS,
  mortarAsset,
  mortarTexture,
  mortarMuzzle,
} from '../src/game/mortar-art';

describe('Mortar level artwork', () => {
  it('selects each playable level, with a stable fallback for legacy levels', () => {
    expect(MORTAR_ART_LEVELS).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(MORTAR_ART_LEVELS.map(mortarTexture)).size).toBe(6);
    for (const level of MORTAR_ART_LEVELS) expect(asset('mortar', level)).toBe(mortarAsset(level));
    expect(asset('mortar', 10)).toBe(mortarAsset(6));
    expect(mortarTexture(NaN)).toBe('mortar');
    expect(mortarTexture(0)).toBe('mortar');
  });

  it('ships six distinct clean cutouts with aligned feet and transparent borders', async () => {
    const hashes = new Set<string>();
    for (const level of MORTAR_ART_LEVELS) {
      const { data, info } = await sharp(`public${mortarAsset(level)}`)
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect([info.width, info.height, info.channels]).toEqual([384, 384, 4]);
      const muzzle = mortarMuzzle(level);
      const mouth = (Math.round(muzzle.y * 384) * 384 + Math.round(muzzle.x * 384)) * 4;
      expect(data[mouth + 3]).toBe(255);
      expect(Math.max(data[mouth], data[mouth + 1], data[mouth + 2])).toBeLessThan(80);
      let visible = 0,
        bottom = 0;
      for (let y = 0; y < 384; y++)
        for (let x = 0; x < 384; x++) {
          const alpha = data[(y * 384 + x) * 4 + 3];
          if (x < 8 || x >= 376 || y < 8 || y >= 376) expect(alpha).toBe(0);
          if (alpha > 128) {
            visible++;
            bottom = Math.max(bottom, y);
          }
        }
      expect(visible).toBeGreaterThan(50000);
      expect(bottom).toBeGreaterThanOrEqual(362);
      expect(bottom).toBeLessThanOrEqual(366);
      hashes.add(createHash('sha256').update(data).digest('hex'));
    }
    expect(hashes.size).toBe(6);
  });
});
