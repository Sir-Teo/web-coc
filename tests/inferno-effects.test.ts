import { expect, it } from 'vitest';
import type { Battle } from '../src/game/model';
import { infernoImpactPoses } from '../src/game/inferno-effects';
const iso = (x: number, y: number) => ({ x: x * 32, y: y * 16 });
function fixture() {
  return {
    elapsed: 0.328,
    infernos: { 1: { hits: [{ at: 0.128, slot: 0, targetX: 12, targetY: 15, toAir: false }] } },
  } as unknown as Battle;
}
it('emits all three original hit components at recorded target coordinates', () => {
  const poses = infernoImpactPoses(fixture(), false, iso);
  expect(poses).toHaveLength(14);
  expect(poses.filter((p) => p.emitter === 'Dark Tower Hit sparks')).toHaveLength(1);
  expect(poses.filter((p) => p.emitter === 'Light Dust')).toHaveLength(5);
  expect(poses.filter((p) => p.emitter === 'Dark Tower Hit')).toHaveLength(8);
  const air = fixture();
  air.infernos![1].hits[0].toAir = true;
  const lifted = infernoImpactPoses(air, false, iso);
  expect(lifted.map((p) => p.x)).toEqual(poses.map((p) => p.x));
  lifted.forEach((p, i) => expect(p.y).toBeCloseTo(poses[i].y - 46, 8));
});
it('keeps identities and random samples stable after old hit retirement and serialization', () => {
  const battle = fixture();
  const expected = infernoImpactPoses(battle, false, iso);
  battle.infernos![1].hits.unshift({ ...battle.infernos![1].hits[0], at: -4 });
  expect(infernoImpactPoses(battle, false, iso)).toEqual(expected);
  expect(infernoImpactPoses(JSON.parse(JSON.stringify(battle)), false, iso)).toEqual(expected);
});
it('suppresses future, expired, reduced-motion and finished effects', () => {
  const battle = fixture();
  expect(infernoImpactPoses(battle, true, iso)).toEqual([]);
  battle.elapsed = 0;
  expect(infernoImpactPoses(battle, false, iso)).toEqual([]);
  battle.elapsed = 3;
  expect(infernoImpactPoses(battle, false, iso)).toEqual([]);
  battle.elapsed = 0.328;
  battle.finished = true;
  expect(infernoImpactPoses(battle, false, iso)).toEqual([]);
});
