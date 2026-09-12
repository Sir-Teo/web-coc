import { expect, it } from 'vitest';
import {
  SANTA_GROUPS,
  santaPoses,
  santaQuad,
  santaSoundCues,
  santaTrapFrame,
} from '../src/game/santa-art';
import { makeSantaState, SANTA_TRAP } from '../src/game/santa-trap';
import type { TrapState } from '../src/game/traps';

const state: TrapState = { activatedAt: 0.05, resolved: false, targetId: 42, x: 36.5, y: 29.5 };
state.santa = makeSantaState(state, 1160, 123);
const cast = state.santa.castAt;
it('holds native setup, trigger and spent poses at exact simulation-time boundaries', () => {
  const clips = SANTA_GROUPS.trap.clips;
  expect(santaTrapFrame(undefined, 0)).toBe(clips.setup.frames[0]);
  expect(santaTrapFrame(state, 0.05 + 19 / 24)).toBe(clips.trigger.frames[19]);
  expect(santaTrapFrame(state, 0.05 + 43 / 24)).toBe(clips.trigger.frames[43]);
  expect(santaTrapFrame(state, 0.05 + SANTA_TRAP.delay)).toBe(clips.spent.frames[0]);
  expect(santaTrapFrame(state, 1, true)).toBe(clips.setup.frames[0]);
  expect(santaTrapFrame(state, 10, true)).toBe(clips.spent.frames[0]);
});
it('keeps native shear in mesh vertices instead of reducing it to rotation and scale', () => {
  const bounds = SANTA_GROUPS.sleigh.bounds;
  const quad = santaQuad({
    key: 'test',
    group: 'sleigh',
    frame: 0,
    matrix: [1, 0.25, 10, 0.5, 2, 20],
    alpha: 1,
  });
  const [l, t, r, b] = bounds;
  expect(quad.vertices.filter((_, i) => i % 4 < 2)).toEqual([
    l + 0.25 * t + 10,
    0.5 * l + 2 * t + 20,
    l + 0.25 * b + 10,
    0.5 * l + 2 * b + 20,
    r + 0.25 * t + 10,
    0.5 * r + 2 * t + 20,
    r + 0.25 * b + 10,
    0.5 * r + 2 * b + 20,
  ]);
  const uvs = quad.vertices.filter((_, i) => i % 4 >= 2);
  expect(uvs.every((v) => v >= 0 && v <= 1)).toBe(true);
  const tipping = santaPoses(state, cast + 114 / 24).find((p) => p.key === 'sleigh-1')!;
  expect(tipping.matrix[0] * tipping.matrix[1] + tipping.matrix[3] * tipping.matrix[4]).not.toBe(0);
});
it('reconstructs loaded, tipping and empty components with stable vertices on rewind', () => {
  const loaded = santaPoses(state, cast + 4.5),
    empty = santaPoses(state, cast + 5);
  expect(loaded.filter((p) => p.group === 'sleigh')).toHaveLength(2);
  expect(empty.filter((p) => p.group === 'sleigh')).toHaveLength(2);
  expect(loaded.find((p) => p.key === 'sleigh-1')!.frame).not.toBe(
    empty.find((p) => p.key === 'sleigh-1')!.frame,
  );
  expect(santaPoses(state, cast + 4.5)).toEqual(loaded);
  expect(santaPoses(state, cast - 0.001)).toEqual([]);
  expect(santaPoses(state, cast + 15)).toEqual([]);
});
it('lands every gift and its ground shadow at the saved point, with reduced motion preserving timing', () => {
  for (const [i, strike] of state.santa!.strikes.entries()) {
    const before = santaPoses(state, strike.dropAt - 0.000001);
    expect(before.some((p) => p.key === `gift-${i}`)).toBe(false);
    const poses = santaPoses(state, strike.hitAt - 0.000001),
      gift = poses.find((p) => p.key === `gift-${i}`)!,
      shadow = poses.find((p) => p.key === `gift-shadow-${i}`)!;
    const x = (strike.x - state.x - strike.y + state.y) * 32,
      y = (strike.x - state.x + strike.y - state.y) * 16;
    expect(gift.matrix[2]).toBeCloseTo(x, 3);
    expect(gift.matrix[5]).toBeCloseTo(y, 3);
    expect(shadow.matrix[2]).toBeCloseTo(x, 10);
    expect(shadow.matrix[5]).toBeCloseTo(y, 10);
    expect(santaPoses(state, strike.hitAt).some((p) => p.key === `gift-${i}`)).toBe(false);
    const reduced = santaPoses(state, strike.dropAt + 0.05, true);
    expect(reduced.some((p) => p.group === 'sleigh' || p.key.startsWith('debris'))).toBe(false);
    expect(reduced.find((p) => p.key === `gift-${i}`)!.matrix[2]).toBeCloseTo(x, 10);
  }
});
it('ties all twelve original sound cues to the same strike timeline and unique trap identity', () => {
  const cues = santaSoundCues(state, '1160');
  expect(cues).toHaveLength(12);
  expect(new Set(cues.map((c) => c.key)).size).toBe(12);
  expect(cues[0]).toMatchObject({ at: cast, pitch: 0.6 });
  expect(cues[1]).toMatchObject({ at: cast + 2.5, pitch: 0.75 });
  expect(cues.filter((c) => c.sample === 'santa-impact').map((c) => c.at)).toEqual(
    state.santa!.strikes.map((s) => s.hitAt),
  );
});
