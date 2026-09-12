import { it, expect } from 'vitest';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { TESLA_ART_LEVELS, teslaAsset, teslaTexture } from '../src/game/tesla-art';
import { asset, buildingTexture } from '../src/game/data';

it('ships six distinct transparent Tesla levels with clear canvas margins', async () => {
  const hashes = new Set<string>();
  for (const level of TESLA_ART_LEVELS) {
    expect(asset('tesla', level)).toBe(teslaAsset(level));
    expect(buildingTexture('tesla', level)).toBe(teslaTexture(level));
    const { data, info } = await sharp(`public${teslaAsset(level)}`)
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height, info.channels]).toEqual([384, 512, 4]);
    let opaque = 0,
      partial = 0;
    for (let y = 0; y < 512; y++)
      for (let x = 0; x < 384; x++) {
        const alpha = data[(y * 384 + x) * 4 + 3];
        if (x < 16 || x >= 368 || y < 24 || y >= 488) expect(alpha).toBe(0);
        if (alpha > 250) opaque++;
        else if (alpha > 0) partial++;
      }
    expect(opaque / (384 * 512)).toBeGreaterThan(0.15);
    expect(opaque / (384 * 512)).toBeLessThan(0.55);
    expect(partial / (384 * 512)).toBeLessThan(0.07);
    hashes.add(createHash('sha256').update(data).digest('hex'));
  }
  expect(hashes.size).toBe(6);
});
