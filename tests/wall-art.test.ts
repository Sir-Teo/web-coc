import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { wallArt, wallAsset, wallTexture, WALL_ART_LEVELS } from '../src/game/wall-art';
import { asset, BUILDINGS } from '../src/game/data';

describe('wall level artwork', () => {
  it('maps every supported level to distinct art and preserves a safe legacy fallback', () => {
    expect(WALL_ART_LEVELS).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(WALL_ART_LEVELS.map(wallTexture)).size).toBe(8);
    expect(WALL_ART_LEVELS.map((l) => wallArt(l).material)).toEqual([
      'wood',
      'rubble',
      'stone',
      'iron',
      'gold',
      'crystal',
      'crystal',
      'obsidian',
    ]);
    expect(wallArt(6).face).not.toBe(wallArt(7).face);
    expect(asset('wall', 8)).toBe(wallAsset(8));
    expect(asset('wall', 12)).toBe(wallAsset(8));
    expect(wallArt(NaN).level).toBe(1);
    expect(wallArt(-2).level).toBe(1);
    expect(BUILDINGS.wall.name).toBe('Wall');
  });
  it('ships eight unique transparent frames with aligned feet and no opaque cyan matte', async () => {
    const hashes = new Set<string>();
    for (const level of WALL_ART_LEVELS) {
      const { data, info } = await sharp(`public${wallAsset(level)}`)
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect([info.width, info.height, info.channels]).toEqual([192, 256, 4]);
      let visible = 0,
        maxY = 0,
        minX = 192,
        maxX = 0;
      for (let y = 0; y < 256; y++)
        for (let x = 0; x < 192; x++) {
          const i = (y * 192 + x) * 4;
          if (x < 4 || x >= 188 || y < 4 || y >= 252) expect(data[i + 3]).toBe(0);
          if (data[i + 3] > 128) {
            visible++;
            maxY = y;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
          }
          if (data[i + 3] > 32)
            expect(Math.min(data[i + 1], data[i + 2]) - data[i]).toBeLessThan(80);
        }
      expect(visible).toBeGreaterThan(15000);
      expect(maxY).toBeGreaterThanOrEqual(243);
      expect(maxY).toBeLessThanOrEqual(245);
      expect(Math.abs((minX + maxX) / 2 - 95.5)).toBeLessThan(5);
      hashes.add(createHash('sha256').update(data).digest('hex'));
    }
    expect(hashes.size).toBe(8);
  });
});
