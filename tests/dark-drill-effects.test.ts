import { expect, it } from 'vitest';
import { darkDrillHandlingPoses } from '../src/game/dark-drill-effects';
const iso = (x: number, y: number) => ({ x: x * 32, y: y * 16 });
const event = { id: 2, index: 1, kind: 'pickup' as const, at: 10, x: 12, y: 14 };
it('emits all three original grass particles for both handling actions', () => {
  for (const kind of ['pickup', 'place'] as const) {
    const poses = darkDrillHandlingPoses([{ ...event, kind }], 10.15, false, iso);
    expect(poses).toHaveLength(3);
    expect(poses.every((p) => p.emitter === 'Grass' && p.poses.length > 0)).toBe(true);
    expect(new Set(poses.map((p) => p.key)).size).toBe(3);
  }
});
it('keeps particle poses stable across serialization and event retirement', () => {
  const poses = darkDrillHandlingPoses([event], 10.15, false, iso);
  expect(darkDrillHandlingPoses(JSON.parse(JSON.stringify([event])), 10.15, false, iso)).toEqual(
    poses,
  );
  expect(darkDrillHandlingPoses([{ ...event, index: 0, at: 1 }, event], 10.15, false, iso)).toEqual(
    poses,
  );
  expect(darkDrillHandlingPoses([event], 9, false, iso)).toEqual([]);
  expect(darkDrillHandlingPoses([event], 11, false, iso)).toEqual([]);
  expect(darkDrillHandlingPoses([event], 10.15, true, iso)).toEqual([]);
});

it('reconstructs original destruction debris, smoke and grass after seeking', async () => {
  const { darkDrillDestructionPoses } = await import('../src/game/dark-drill-effects');
  const { darkDrillDestructionCues } = await import('../src/game/dark-drill-sounds');
  const history = { 7: { at: 10, x: 12, y: 14, level: 3 } };
  const poses = darkDrillDestructionPoses(history, 10.15, false, iso);
  expect(poses.filter((p) => p.emitter === 'Building Destroyed')).toHaveLength(30);
  expect(poses.filter((p) => p.emitter === 'Smoke')).toHaveLength(10);
  expect(poses.filter((p) => p.emitter === 'Grass')).toHaveLength(3);
  expect(new Set(poses.map((p) => p.key)).size).toBe(43);
  expect(darkDrillDestructionPoses(JSON.parse(JSON.stringify(history)), 10.15, false, iso)).toEqual(
    poses,
  );
  expect(darkDrillDestructionPoses(history, 9, false, iso)).toEqual([]);
  expect(darkDrillDestructionPoses(history, 13, false, iso)).toEqual([]);
  expect(darkDrillDestructionPoses(history, 10.15, true, iso)).toEqual([]);
  const cue = darkDrillDestructionCues(history)[0];
  expect(cue).toMatchObject({
    at: 10,
    volume: 0.8,
    sample: 'dark-drill-building_destroyed_01.ogg',
  });
  expect(cue.pitch).toBeGreaterThanOrEqual(0.85);
  expect(cue.pitch).toBeLessThanOrEqual(0.95);
  expect(darkDrillDestructionCues(JSON.parse(JSON.stringify(history)))[0]).toEqual(cue);
  expect(darkDrillDestructionCues(undefined)).toEqual([]);
});
