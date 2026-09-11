import { it, expect } from 'vitest';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { LATE_TROOP_KEYS, asset, walkAsset } from '../src/game/data';
import { troopArt } from '../src/game/troop-art';

for (const kind of LATE_TROOP_KEYS) {
  it(`${kind} ships four distinct transparent poses with clear margins and a matching portrait`, async () => {
    const atlas = `public${walkAsset(kind).replace('.webp', `${troopArt(kind).version}.webp`)}`;
    const meta = await sharp(atlas).metadata();
    expect([meta.width, meta.height, meta.hasAlpha]).toEqual([512, 128, true]);
    const hashes = new Set<string>();
    for (let i = 0; i < 4; i++) {
      const data = await sharp(atlas)
        .extract({ left: i * 128, top: 0, width: 128, height: 128 })
        .raw()
        .toBuffer();
      let visible = 0,
        border = 0,
        bottom = 0;
      for (let y = 0; y < 128; y++)
        for (let x = 0; x < 128; x++) {
          const alpha = data[(y * 128 + x) * 4 + 3];
          if (x < 4 || x >= 124 || y < 4 || y >= 124) border += alpha;
          if (alpha > 32) {
            visible++;
            bottom = Math.max(bottom, y);
          }
        }
      expect(border).toBe(0);
      expect(visible).toBeGreaterThan(2000);
      expect(bottom).toBeGreaterThanOrEqual(120);
      expect(bottom).toBeLessThanOrEqual(122);
      hashes.add(createHash('sha256').update(data).digest('hex'));
    }
    expect(hashes.size).toBe(4);
    const portrait = await sharp(`public${asset(kind)}`).metadata();
    expect([portrait.width, portrait.height, portrait.hasAlpha]).toEqual([360, 440, true]);
  });
}
