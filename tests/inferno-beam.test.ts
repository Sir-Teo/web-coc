import { expect, it } from 'vitest';
import { infernoBeamAlpha, infernoBeamPoses, infernoBeamProfile } from '../src/game/inferno-beam';
import { INFERNO_GRAPH } from '../src/game/inferno-graph';
it('resolves every tier and heat stage to retained source beam exports', () => {
  const exports = new Set<string>();
  for (let level = 1; level <= 12; level++)
    for (const stage of [0, 1, 2] as const) {
      const profile = infernoBeamProfile(level, stage);
      expect(INFERNO_GRAPH.exports[profile.export]).toBeTypeOf('number');
      expect(profile.startZ).toBe(100);
      expect(profile.fadeIn).toBe(0.128);
      expect(profile.pitch).toBe([1, 1.2, 1.4][stage]);
      exports.add(profile.export);
      expect(
        infernoBeamPoses(level, stage, 0.5, { x: 20, y: 30 }, { x: 180, y: -50 }).length,
      ).toBeGreaterThan(0);
    }
  expect(exports.size).toBe(6);
});
it('handles coincident endpoints without invalid transforms', () => {
  expect(infernoBeamPoses(1, 0, 0, { x: 1, y: 2 }, { x: 1, y: 2 })).toEqual([]);
});

it('uses the source acquisition fade for all tiers and heat stages', () => {
  for (let level = 1; level <= 12; level++)
    for (const stage of [0, 1, 2] as const) {
      for (const [age, alpha] of [
        [-1, 0],
        [0, 0],
        [0.032, 0.25],
        [0.064, 0.5],
        [0.096, 0.75],
        [0.128, 1],
        [1.5, 1],
        [5.312, 1],
      ])
        expect(infernoBeamAlpha(level, stage, age)).toBeCloseTo(alpha, 10);
    }
  expect(() => infernoBeamAlpha(1, 0, NaN)).toThrow('Invalid Inferno beam age');
});
