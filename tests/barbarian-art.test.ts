import { it, expect } from 'vitest';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { asset, walkAsset } from '../src/game/data';

it('ships four distinct transparent Barbarian poses without clipped feet or chroma matte', async () => {
  const atlas = await sharp(`public${walkAsset('swordsman')}`).metadata();
  expect([atlas.width, atlas.height, atlas.hasAlpha]).toEqual([512, 128, true]);
  const hashes = new Set<string>();
  for (let i = 0; i < 4; i++) {
    const data = await sharp(`public${walkAsset('swordsman')}`)
      .extract({ left: i * 128, top: 0, width: 128, height: 128 })
      .raw()
      .toBuffer();
    let pixels = 0,
      border = 0,
      matte = 0,
      bottom = 0;
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < 128; x++) {
        const p = (y * 128 + x) * 4,
          alpha = data[p + 3];
        if (x < 4 || x >= 124 || y < 4 || y >= 124) border += alpha;
        if (alpha > 32) {
          pixels++;
          bottom = Math.max(bottom, y);
          if (Math.min(data[p], data[p + 2]) - data[p + 1] > 45) matte++;
        }
      }
    expect(border).toBe(0);
    expect(matte).toBe(0);
    expect(pixels).toBeGreaterThan(3000);
    expect(pixels).toBeLessThan(9000);
    expect(bottom).toBeGreaterThanOrEqual(120);
    expect(bottom).toBeLessThanOrEqual(122);
    hashes.add(createHash('sha256').update(data).digest('hex'));
  }
  expect(hashes.size).toBe(4);
});

it('ships the matching card portrait with real alpha and clear outer margins', async () => {
  const { data, info } = await sharp(`public${asset('swordsman')}`)
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect(info.channels).toBe(4);
  expect(info.width).toBe(360);
  let border = 0,
    opaque = 0;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const p = (y * info.width + x) * 4;
      if (x === 0 || x === info.width - 1 || y === 0 || y === info.height - 1)
        border += data[p + 3];
      if (data[p + 3] === 255) opaque++;
    }
  expect(border).toBe(0);
  expect(opaque).toBeGreaterThan(50000);
});
