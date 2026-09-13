import { expect, it } from 'vitest';
import { archerTowerHandlingPoses } from '../src/game/archer-tower-effects';
const iso = (x: number, y: number) => ({ x: x * 32, y: y * 16 });
const event = { id: 2, index: 1, kind: 'pickup' as const, at: 10, x: 12, y: 14 };
it('emits original pickup grass and placement dust plus grass', () => {
  const pickup = archerTowerHandlingPoses([event], 10.15, false, iso);
  expect(pickup).toHaveLength(3);
  expect(pickup.every((p) => p.emitter === 'Grass' && p.poses.length > 0)).toBe(true);
  const placed = archerTowerHandlingPoses([{ ...event, kind: 'place' }], 10.15, false, iso);
  expect(placed.filter((p) => p.emitter === 'Grass')).toHaveLength(3);
  expect(placed.filter((p) => p.emitter === 'Place')).toHaveLength(3);
  expect(placed.every((p) => p.poses.length > 0)).toBe(true);
  expect(new Set(placed.map((p) => p.key)).size).toBe(6);
});
it('keeps particle poses stable across serialization and event retirement', () => {
  const poses = archerTowerHandlingPoses([event], 10.15, false, iso);
  expect(archerTowerHandlingPoses(JSON.parse(JSON.stringify([event])), 10.15, false, iso)).toEqual(
    poses,
  );
  expect(
    archerTowerHandlingPoses([{ ...event, index: 0, at: 1 }, event], 10.15, false, iso),
  ).toEqual(poses);
  expect(archerTowerHandlingPoses([event], 9, false, iso)).toEqual([]);
  expect(archerTowerHandlingPoses([event], 11, false, iso)).toEqual([]);
  expect(archerTowerHandlingPoses([event], 10.15, true, iso)).toEqual([]);
});

it('reconstructs both hit effects, preserving separate flashes and air registration', async () => {
  const { archerTowerHitPoses } = await import('../src/game/archer-tower-effects');
  const { archerTowerBattle } = await import('./fixtures/archer-tower-battle');
  const battle = archerTowerBattle().battle!;
  battle.elapsed = 10.075;
  for (let level = 1; level <= 21; level++) {
    battle.archerTowerHits = [{ id: 'test', sourceId: 6, level, at: 10, x: 20, y: 20, air: false }];
    const before = JSON.stringify(battle);
    const ground = archerTowerHitPoses(battle, false, iso);
    expect(ground).toHaveLength(level < 10 ? 2 : 15);
    if (level >= 10)
      expect(ground.filter((p) => p.emitter === 'Arrow_Tower_lightFlash')).toHaveLength(2);
    expect(new Set(ground.map((p) => p.key)).size).toBe(ground.length);
    expect(ground.every((p) => p.poses.length > 0)).toBe(true);
    expect(archerTowerHitPoses(JSON.parse(before), false, iso)).toEqual(ground);
    expect(JSON.stringify(battle)).toBe(before);
    battle.archerTowerHits[0].air = true;
    const air = archerTowerHitPoses(battle, false, iso, 46);
    air.forEach((p, i) => {
      expect(p.poses).toEqual(ground[i].poses);
      expect(p.y).toBeCloseTo(ground[i].y - 46);
      expect(p.depth).toBe(8000);
    });
    expect(archerTowerHitPoses(battle, true, iso)).toEqual([]);
  }
  battle.elapsed = 9;
  expect(archerTowerHitPoses(battle, false, iso)).toEqual([]);
  battle.elapsed = 12;
  expect(archerTowerHitPoses(battle, false, iso)).toEqual([]);
});
