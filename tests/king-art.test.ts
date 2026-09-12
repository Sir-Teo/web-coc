import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { KING_DIRECTIONS, kingAtlas, kingPose } from '../src/game/king-art';
import { asset } from '../src/game/data';
import { makeBuilding, type Unit } from '../src/game/model';

const king = (): Unit => ({
  id: 4,
  kind: 'swordsman',
  hero: 'king',
  x: 10,
  y: 10,
  hp: 1754,
  maxHp: 1754,
  cooldown: 0,
  target: null,
  path: [],
  pathAt: 0,
  attacking: false,
});

it('ships 36 distinct transparent King poses with safe sword/crown/foot margins', async () => {
  const hashes = new Set<string>();
  for (const direction of KING_DIRECTIONS) {
    const file = `public${kingAtlas(direction)}`;
    const meta = await sharp(file).metadata();
    expect([meta.width, meta.height, meta.hasAlpha]).toEqual([2304, 256, true]);
    for (let frame = 0; frame < 9; frame++) {
      const data = await sharp(file)
        .extract({ left: frame * 256, top: 0, width: 256, height: 256 })
        .raw()
        .toBuffer();
      let pixels = 0,
        border = 0,
        matte = 0;
      for (let y = 0; y < 256; y++)
        for (let x = 0; x < 256; x++) {
          const p = (y * 256 + x) * 4,
            alpha = data[p + 3];
          if (x < 6 || x >= 250 || y < 6 || y >= 250) border += alpha;
          if (alpha > 32) {
            pixels++;
            if (Math.min(data[p], data[p + 2]) - data[p + 1] > 45) matte++;
          }
        }
      expect(border, `${direction} frame ${frame} clips an edge`).toBe(0);
      expect(matte, `${direction} frame ${frame} retains matte`).toBe(0);
      expect(pixels, `${direction} frame ${frame} has a complete silhouette`).toBeGreaterThan(
        10000,
      );
      expect(pixels).toBeLessThan(40000);
      hashes.add(createHash('sha256').update(data).digest('hex'));
    }
  }
  expect(hashes.size).toBe(36);
});

it('uses the matching versioned King portrait with real alpha', async () => {
  expect(asset('king')).toBe('/assets/characters/king-v1/portrait.webp');
  const { data, info } = await sharp(`public${asset('king')}`)
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect(info.channels).toBe(4);
  let border = 0,
    opaque = 0;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const a = data[(y * info.width + x) * 4 + 3];
      if (x < 3 || x >= info.width - 3 || y < 3 || y >= info.height - 3) border += a;
      if (a === 255) opaque++;
    }
  expect(border).toBe(0);
  expect(opaque).toBeGreaterThan(50000);
});

describe('directional King presentation', () => {
  it('follows each navigation quarter instead of mirroring asymmetric equipment', () => {
    const unit = king();
    for (const [x, y, direction] of [
      [10, 13, 'front-left'],
      [13, 10, 'front-right'],
      [7, 10, 'back-left'],
      [10, 7, 'back-right'],
    ] as const) {
      unit.path = [{ x, y }];
      expect(kingPose(unit, undefined, 0.08, 1.2, false)).toMatchObject({ direction, frame: 1 });
    }
  });
  it('faces the target center during an attack even when its old route points away', () => {
    const unit = king();
    unit.path = [{ x: 7, y: 10 }];
    unit.attacking = true;
    const target = makeBuilding(7, 'townhall', 11, 11);
    expect(kingPose(unit, target, 0, 1.2, false).direction).toBe('front-left');
    target.x = 14;
    expect(kingPose(unit, target, 0, 1.2, false).direction).toBe('front-right');
  });
  it('retains the previous quarter on straight screen axes and at rest', () => {
    const unit = king();
    expect(kingPose(unit, undefined, 1, 1.2, false, 'back-right')).toMatchObject({
      direction: 'back-right',
      frame: 0,
    });
    unit.path = [{ x: 11, y: 11 }];
    expect(kingPose(unit, undefined, 1, 1.2, false, 'back-right').direction).toBe('front-right');
    unit.path = [{ x: 11, y: 9 }];
    expect(kingPose(unit, undefined, 1, 1.2, false, 'back-left').direction).toBe('back-right');
  });
  it('uses four battle-clock strides and a fixed idle pose for reduced motion', () => {
    const unit = king();
    unit.path = [{ x: 13, y: 10 }];
    expect(
      [0.08, 0.24, 0.4, 0.56, 0.72].map((t) => kingPose(unit, undefined, t, 1.2, false).frame),
    ).toEqual([1, 2, 3, 4, 1]);
    expect(kingPose(unit, undefined, 50, 1.2, true).frame).toBe(0);
    unit.attacking = true;
    expect(kingPose(unit, undefined, 50, 1.2, true).frame).toBe(0);
  });
  it('strikes when damage lands, follows through, recovers and winds up for the next hit', () => {
    const unit = king();
    unit.attacking = true;
    expect(
      [0, 0.18, 0.3, 0.5, 0.85].map((phase) => {
        unit.cooldown = 1.2 * (1 - phase);
        return kingPose(unit, undefined, 9999, 1.2, false).frame;
      }),
    ).toEqual([6, 7, 8, 0, 5]);
  });
});
