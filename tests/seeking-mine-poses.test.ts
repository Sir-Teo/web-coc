import { expect, it } from 'vitest';
import sharp from 'sharp';
import { asset, buildingTexture } from '../src/game/data';
import {
  SEEKING_MINE_ART,
  seekingMinePreview,
  seekingMineTexture,
  seekingMineFamily,
} from '../src/game/seeking-mine-art';
import {
  SEEKING_MINE_GRAPH,
  seekingMinePoses,
  seekingMineBodyState,
  seekingMineProjectilePose,
  seekingMineBounds,
} from '../src/game/seeking-mine-poses';
import combat from '../reference/seeking-mine/combat.json';
import { nativeScenePoses } from '../src/game/native-mesh';
const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });
const trap = { activatedAt: 1, resolved: false, targetId: 2, x: 4.5, y: 5.5 };

it('uses four original world families and the independent shared Info picture at all eight levels', async () => {
  expect(Array.from({ length: 8 }, (_, i) => seekingMineFamily(i + 1))).toEqual([
    1, 1, 3, 3, 5, 5, 7, 7,
  ]);
  for (let level = 1; level <= 8; level++) {
    expect(buildingTexture('seekingairmine', level)).toBe(seekingMineTexture(level));
    expect(asset('seekingairmine', level)).toBe('/assets/buildings/seeking-mine-native/info.png');
    const world = await sharp(`public${seekingMinePreview(level)}`).metadata();
    expect([world.width, world.height, world.hasAlpha]).toEqual([208, 260, true]);
  }
  expect([SEEKING_MINE_ART.width, SEEKING_MINE_ART.height]).toEqual([83.2, 104]);
  expect(() => seekingMineFamily(9)).toThrow();
});
it.each([1, 3, 5, 7])(
  'keeps native setup, upgrade, spent and complete trigger frames for family %i',
  (level) => {
    const sample = (name: string, age = 0) =>
      nativeScenePoses(SEEKING_MINE_GRAPH, name, age, {}, [0.8, 0, 0, 0, 0.8, -25.6]);
    expect(seekingMinePoses(level, 'setup', 47 / 24)).toEqual(
      sample(combat.levels[level - 1].setup, 47 / 24),
    );
    expect(seekingMinePoses(level, 'constructing')).toEqual(sample(combat.upgrade));
    expect(seekingMinePoses(level, 'upgrading', 1)).toEqual([
      ...sample(combat.levels[level - 1].setup, 1),
      ...sample(combat.upgrade),
    ]);
    expect(seekingMinePoses(level, 'spent')).toEqual(sample(combat.broken));
    expect(seekingMinePoses(level, 'triggered', 0)).toEqual([]);
    expect(seekingMinePoses(level, 'triggered', 1 / 24).length).toBeGreaterThan(0);
    expect(seekingMinePoses(level, 'triggered', 100)).toEqual(sample(combat.trigger, 74 / 24));
    const bounds = seekingMineBounds(level);
    expect(bounds.every(Number.isFinite)).toBe(true);
    expect(bounds[0]).toBeLessThan(0);
    expect(bounds[2]).toBeGreaterThan(0);
    expect(bounds[1]).toBeLessThan(-40);
    expect(bounds[3]).toBeGreaterThan(0);
  },
);
it('separates the full ground animation from impact and keeps reduced motion stationary', () => {
  expect(seekingMineBodyState(undefined, 4, true, false)).toEqual({ state: 'setup', time: 0 });
  expect(seekingMineBodyState({ ...trap, resolved: true }, 2, false, false)).toEqual({
    state: 'triggered',
    time: 1,
  });
  expect(seekingMineBodyState(trap, 1 + 75 / 24, false, false).state).toBe('spent');
  expect(seekingMineBodyState(trap, 1.2, true, false).state).toBe('spent');
  expect(seekingMineBodyState(trap, 1.2, false, true).state).toBe('spent');
});
it.each([1, 3, 5, 7])('preserves empty emergence and play-once projectile family %i', (level) => {
  for (const frame of [0, 1, 2])
    expect(seekingMineProjectilePose(level, trap, 1 + frame / 24, iso, 46).poses).toEqual([]);
  const shot = seekingMineProjectilePose(level, trap, 1 + 6 / 24, iso, 46);
  expect(shot.poses.length).toBeGreaterThan(0);
  expect(shot.shadow.length).toBeGreaterThan(0);
  expect(shot.y).toBe(iso(trap.x, trap.y).y - 23);
  const last = seekingMineProjectilePose(level, trap, 1 + 119 / 24, iso, 46);
  expect(seekingMineProjectilePose(level, trap, 100, iso, 46).poses).toEqual(last.poses);
  expect(last.y).toBe(iso(trap.x, trap.y).y - 46);
});
