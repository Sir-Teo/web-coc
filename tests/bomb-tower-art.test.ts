import { it, expect } from 'vitest';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import {
  bombTowerAsset,
  bombTowerTexture,
  BOMBER_ASSET,
  DEATH_BOMB_ASSET,
} from '../src/game/bomb-tower-art';
import { asset, buildingTexture } from '../src/game/data';
it('ships distinct transparent bases, complete previews, four Bomber poses and the exposed bomb', async () => {
  const hashes = new Set<string>();
  for (const level of [1, 2])
    for (const part of ['base', 'preview']) {
      const path = `public${bombTowerAsset(level, part)}`,
        m = await sharp(path).metadata(),
        s = await sharp(path).stats();
      expect([m.width, m.height, m.hasAlpha]).toEqual([384, 512, true]);
      expect(s.channels[3].min).toBe(0);
      expect(asset('bombtower', level)).toBe(bombTowerAsset(level));
      expect(buildingTexture('bombtower', level)).toBe(bombTowerTexture(level));
      const { data } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
      for (let y = 0; y < 512; y++)
        for (let x = 0; x < 384; x++)
          if (x < 16 || x >= 368 || y < 64 || y >= 488) expect(data[(y * 384 + x) * 4 + 3]).toBe(0);
      hashes.add(createHash('sha256').update(data).digest('hex'));
    }
  expect(hashes.size).toBe(4);
  const sheet = sharp(`public${BOMBER_ASSET}`),
    m = await sheet.metadata();
  expect([m.width, m.height, m.hasAlpha]).toEqual([1024, 256, true]);
  const frames = new Set<string>();
  for (let i = 0; i < 4; i++) {
    const frame = sheet.clone().extract({ left: i * 256, top: 0, width: 256, height: 256 });
    const s = await frame.clone().stats();
    expect(s.channels[3].min).toBe(0);
    expect(s.channels[3].max).toBe(255);
    frames.add(
      createHash('sha256')
        .update(await frame.raw().toBuffer())
        .digest('hex'),
    );
  }
  expect(frames.size).toBe(4);
  const bomb = await sharp(`public${DEATH_BOMB_ASSET}`).metadata();
  expect([bomb.width, bomb.height, bomb.hasAlpha]).toEqual([192, 192, true]);
});
