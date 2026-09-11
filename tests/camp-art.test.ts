import { it, expect } from 'vitest';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { asset, buildingTexture } from '../src/game/data';
import { CAMP_ART_LEVELS, campArt, campAsset, campTexture } from '../src/game/camp-art';

it('uses a distinct camp render for all eight accepted levels, including invalid-level fallback', () => {
  expect(CAMP_ART_LEVELS).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  expect(new Set(CAMP_ART_LEVELS.map(campTexture)).size).toBe(8);
  for (const level of CAMP_ART_LEVELS) {
    expect(asset('camp', level)).toBe(campAsset(level));
    expect(buildingTexture('camp', level)).toBe(campTexture(level));
  }
  expect(campTexture(NaN)).toBe('camp');
  expect(campTexture(0)).toBe('camp');
  expect(campTexture(99)).toBe('camp-level-8');
});

it('ships eight different transparent camp cutouts with no opaque matte and an opaque ground anchor', async () => {
  const hashes = new Set<string>();
  for (const level of CAMP_ART_LEVELS) {
    const { data, info } = await sharp(`public${campAsset(level)}`)
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height, info.channels]).toEqual([384, 384, 4]);
    let visible = 0,
      border = 0,
      matte = 0;
    for (let y = 0; y < 384; y++)
      for (let x = 0; x < 384; x++) {
        const p = (y * 384 + x) * 4,
          alpha = data[p + 3];
        if (x < 8 || x >= 376 || y < 8 || y >= 376) border += alpha;
        if (alpha > 128) {
          visible++;
          if (Math.min(data[p], data[p + 2]) - data[p + 1] > 80) matte++;
        }
      }
    expect(border).toBe(0);
    expect(matte).toBe(0);
    expect(visible).toBeGreaterThan(45000);
    expect(visible).toBeLessThan(110000);
    const art = campArt(level);
    const anchor = (Math.round(art.originY * 384) * 384 + Math.round(art.originX * 384)) * 4;
    expect(data[anchor + 3]).toBe(255);
    hashes.add(createHash('sha256').update(data).digest('hex'));
  }
  expect(hashes.size).toBe(8);
});
