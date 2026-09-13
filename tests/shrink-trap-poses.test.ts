import { expect, it } from 'vitest';
import {
  SHRINK_GRAPH,
  SHRINK_RING_DURATION,
  shrinkTrapPoses,
  shrinkEffectPoses,
  shrinkSoundCues,
} from '../src/game/shrink-trap-poses';
import { makeShrinkState } from '../src/game/shrink-trap';
import { nativeVertices, type NativeScenePose } from '../src/game/native-mesh';
import type { TrapState } from '../src/game/traps';

const state: TrapState = {
  activatedAt: 0.05,
  x: 11,
  y: 23,
  targetId: 99,
  resolved: false,
  shrink: makeShrinkState({ activatedAt: 0.05 }),
};
function vertices(poses: NativeScenePose[]): number[][] {
  return poses.flatMap((p) => ('group' in p ? vertices(p.group) : [nativeVertices(p)]));
}

it('retains the ground compartment while the independent bottle rises, then leaves the source empty compartment', () => {
  const armed = vertices(shrinkTrapPoses(undefined, 0));
  const empty = vertices(shrinkTrapPoses(state, 1));
  expect(armed.length).toBe(1);
  expect(empty.length).toBe(1);
  expect(empty).not.toEqual(armed);
  for (let frame = 0; frame < 13; frame++) {
    const poses = vertices(shrinkTrapPoses(state, 0.05 + frame / 24));
    expect(poses).toHaveLength(2);
    expect(poses[0]).toEqual(empty[0]);
  }
  expect(vertices(shrinkTrapPoses(state, 0.05 + 13 / 24))).toEqual(empty);
  expect(vertices(shrinkTrapPoses(state, 0.1, true))).toEqual(empty);
  expect(vertices(shrinkTrapPoses(state, 0.1, false, true))).toEqual(empty);
});

it('uses the ring’s 685-frame descendant instead of freezing at the one-frame outer clip', () => {
  expect(SHRINK_GRAPH.clips[SHRINK_GRAPH.exports.shrink_range].timeline).toHaveLength(1);
  expect(SHRINK_RING_DURATION).toBe(685 / 24);
  const ring = shrinkEffectPoses(1, state, state.shrink!.deployAt + 4, { x: 0, y: 0 }).find(
    (p) => p.emitter === 'Shrink_deploy_range',
  )!;
  const x = vertices(ring.poses).flatMap((v) => v.filter((_, i) => i % 4 === 0));
  expect(Math.max(...x) - Math.min(...x)).toBeGreaterThan(340);
  expect(ring.depth).toBe(-870);
});

it('keeps a static range marker under reduced motion, removes particles at expiry and leaves simulation untouched', () => {
  const before = JSON.stringify(state),
    point = { x: 50, y: 80 };
  const sample = (time: number) => shrinkEffectPoses(1, state, time, point, true);
  const a = sample(3),
    b = sample(8);
  expect(a.map((p) => p.emitter)).toEqual(['Shrink_deploy_range']);
  expect(vertices(a[0].poses)).toEqual(vertices(b[0].poses));
  expect(sample(state.shrink!.endAt)).toEqual([]);
  expect(shrinkEffectPoses(1, state, 40, point)).toEqual([]);
  expect(JSON.stringify(state)).toBe(before);
});

it('dispatches one original reveal sample without damage or generic hit sounds on refresh', () => {
  expect(shrinkSoundCues(1, state)).toEqual([
    {
      key: 'shrink:1:appear:0',
      sample: 'shrink-shrink_spell_03.ogg',
      at: 0.05,
      volume: 0.9,
      pitch: 1,
    },
  ]);
  expect(shrinkSoundCues(1, { ...state, shrink: { ...state.shrink!, pulses: 75 } })).toEqual(
    shrinkSoundCues(1, state),
  );
});
