import { it, expect } from 'vitest';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import native from '../reference/bombtower/native.json';
import {
  BOMB_TOWER_ART,
  BOMB_TOWER_ART_LEVELS,
  bombTowerAsset,
  bombTowerTexture,
} from '../src/game/bomb-tower-art';
import { asset, buildingTexture } from '../src/game/data';

it('ships thirteen distinct unclipped source portraits with the same live ground registration', async () => {
  const hashes = new Set<string>();
  for (const level of BOMB_TOWER_ART_LEVELS) {
    const path = `public${bombTowerAsset(level)}`,
      m = await sharp(path).metadata();
    expect([m.width, m.height, m.hasAlpha]).toEqual([360, 420, true]);
    expect(asset('bombtower', level)).toBe(bombTowerAsset(level));
    expect(buildingTexture('bombtower', level)).toBe(bombTowerTexture(level));
    const { data } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
    let occupied = 0;
    for (let y = 0; y < 420; y++)
      for (let x = 0; x < 360; x++) {
        const a = data[(y * 360 + x) * 4 + 3];
        if (x < 8 || x >= 352 || y < 8 || y >= 412) expect(a).toBe(0);
        if (a) occupied++;
      }
    expect(occupied).toBeGreaterThan(10000);
    const hash = createHash('sha256').update(data).digest('hex');
    expect(hash).toBe(native.previews[String(level) as keyof typeof native.previews].rgbaSha256);
    hashes.add(hash);
  }
  expect(hashes.size).toBe(13);
  const { originY, height, scale, anchorY } = BOMB_TOWER_ART;
  expect(-originY * height + 65 * scale).toBeCloseTo(-anchorY * scale);
});
