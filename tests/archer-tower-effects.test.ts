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
