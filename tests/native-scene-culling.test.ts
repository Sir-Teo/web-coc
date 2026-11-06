import { expect, it } from 'vitest';
import { nativeEffectInView } from '../src/game/native-scene-culling';
import type { NativeMeshPose, NativeScenePose } from '../src/game/native-mesh';

const view = { centerX: 50, centerY: 50, width: 100, height: 100 };
const leaf = (matrix: NativeMeshPose['matrix'] = [1, 0, 0, 0, 1, 0]): NativeMeshPose => ({
  key: 'leaf',
  texture: 0,
  vertices: [0, 0, 0, 0, 0, 10, 0, 1, 10, 0, 1, 0, 10, 10, 1, 1],
  matrix,
  multiply: [1, 1, 1, 1],
  add: [0, 0, 0, 0],
  blend: 0,
});

it('keeps on-screen origins and rejects complete geometry beyond each viewport edge', () => {
  expect(nativeEffectInView([leaf()], 50, 50, view)).toBe(true);
  for (const [x, y] of [
    [-20, 50],
    [101, 50],
    [50, -20],
    [50, 101],
  ])
    expect(nativeEffectInView([leaf()], x, y, view)).toBe(false);
});

it('retains filtered edges and geometry reaching in from an off-screen origin', () => {
  expect(nativeEffectInView([leaf()], -11, 50, view, 2)).toBe(true);
  expect(nativeEffectInView([leaf()], -13, 50, view, 2)).toBe(false);
  expect(nativeEffectInView([leaf([20, 0, 0, 0, 1, 0])], -150, 50, view)).toBe(true);
  expect(nativeEffectInView([leaf([-2, 0, 0, 0, 1, 0])], 110, 50, view)).toBe(true);
  expect(nativeEffectInView([leaf([0, -2, 0, 2, 0, 0])], 110, -5, view)).toBe(true);
});

it('checks nested blend groups without confusing space between disjoint leaves with geometry', () => {
  const group: NativeScenePose = {
    key: 'group',
    blend: 8,
    multiply: [1, 1, 1, 1],
    add: [0, 0, 0, 0],
    group: [leaf([1, 0, -100, 0, 1, 0]), leaf([1, 0, 200, 0, 1, 0])],
  };
  expect(nativeEffectInView([group], -20, 50, view)).toBe(false);
  group.group.push({ ...group, group: [leaf([1, 0, 40, 0, 1, 0])] });
  expect(nativeEffectInView([group], -20, 50, view)).toBe(true);
});

it('fails open without usable camera data or finite geometry', () => {
  expect(nativeEffectInView([leaf()], 1000, 1000)).toBe(true);
  expect(nativeEffectInView([leaf()], 1000, 1000, { ...view, width: 0 })).toBe(true);
  expect(nativeEffectInView([leaf()], NaN, 1000, view)).toBe(true);
  expect(nativeEffectInView([leaf()], 1000, 1000, view, NaN)).toBe(true);
  expect(nativeEffectInView([leaf([NaN, 0, 0, 0, 1, 0])], 1000, 1000, view)).toBe(true);
});

it('does not retain geometry or camera bounds between calls', () => {
  const poses = [leaf()];
  expect(nativeEffectInView(poses, 1000, 50, view)).toBe(false);
  expect(nativeEffectInView(poses, 1000, 50, { ...view, centerX: 1050 })).toBe(true);
  poses[0].matrix[2] = -980;
  expect(nativeEffectInView(poses, 1000, 50, view)).toBe(true);
  expect(nativeEffectInView([], 1000, 1000, view)).toBe(false);
});
