import { describe, expect, it } from 'vitest';
import { flattenDisjointGroups } from '../src/game/native-scene-flatten';
import type { NativeGroupPose, NativeMeshPose, NativeScenePose } from '../src/game/native-mesh';

const square = (
  key: string,
  tx: number,
  ty: number,
  extra: Partial<NativeMeshPose> = {},
): NativeMeshPose => ({
  key,
  texture: 0,
  vertices: [0, 0, 0, 0, 10, 0, 1, 0, 0, 10, 0, 1, 10, 10, 1, 1],
  matrix: [1, 0, tx, 0, 1, ty],
  multiply: [1, 1, 1, 1],
  add: [0, 0, 0, 0],
  blend: 0,
  ...extra,
});
const group = (
  key: string,
  children: NativeScenePose[],
  extra: Partial<NativeGroupPose> = {},
): NativeGroupPose => ({
  key,
  group: children,
  multiply: [1, 1, 1, 1],
  add: [0, 0, 0, 0],
  blend: 8,
  ...extra,
});

describe('flattenDisjointGroups', () => {
  it('lifts the leaves of an additive group whose leaves never overlap, folding alpha and color', () => {
    const poses = [
      square('body', 0, 0),
      group('glow', [square('a', 100, 0, { multiply: [0.5, 1, 1, 0.5] }), square('b', 200, 0)], {
        multiply: [1, 0.5, 1, 0.8],
        add: [0, 0, 0.25, 0],
      }),
    ];
    const out = flattenDisjointGroups(poses);
    expect(out).not.toBe(poses);
    expect(out.map((p) => p.key)).toEqual(['body', 'a', 'b']);
    const a = out[1] as NativeMeshPose;
    expect(a.blend).toBe(8);
    expect(a.folded).toBe(true);
    expect(a.multiply).toEqual([0.5, 0.5, 1, 0.4]);
    expect(a.add).toEqual([0, 0, 0.25, 0]);
    expect(a.vertices).toBe(poses[1].group[0].vertices);
    expect(out[0]).toBe(poses[0]);
  });
  it('keeps groups whose leaves overlap, multiply groups and nested colored groups isolated', () => {
    const overlapping = group('o', [square('a', 0, 0), square('b', 5, 5)]);
    const multiply = group('m', [square('c', 100, 0), square('d', 200, 0)], { blend: 3 });
    const nestedColored = group('n', [
      square('e', 300, 0),
      group('inner', [square('f', 400, 0)], { multiply: [0.5, 0.5, 0.5, 1] }),
    ]);
    const poses = [overlapping, multiply, nestedColored];
    expect(flattenDisjointGroups(poses)).toBe(poses);
  });
  it('keeps a group whose leaf color would saturate before the group clamp', () => {
    const poses = [
      group('s', [
        square('a', 0, 0, { multiply: [1, 1, 1, 1], add: [0.5, 0, 0, 0] }),
        square('b', 100, 0),
      ]),
    ];
    expect(flattenDisjointGroups(poses)).toBe(poses);
  });
  it('folds a nested colorless group by its alpha and returns the same array for the same input', () => {
    const poses = [
      group(
        'outer',
        [square('a', 0, 0), group('inner', [square('b', 100, 0)], { multiply: [1, 1, 1, 0.5] })],
        {
          multiply: [1, 1, 1, 0.5],
        },
      ),
    ];
    const out = flattenDisjointGroups(poses);
    expect(out.map((p) => p.key)).toEqual(['a', 'b']);
    expect((out[0] as NativeMeshPose).multiply[3]).toBe(0.5);
    expect((out[1] as NativeMeshPose).multiply[3]).toBe(0.25);
    expect(flattenDisjointGroups(poses)).toBe(out);
  });
  it('treats leaves within one world pixel of each other as overlapping', () => {
    const poses = [group('g', [square('a', 0, 0), square('b', 10.5, 0)])];
    expect(flattenDisjointGroups(poses)).toBe(poses);
    const apart = [group('g', [square('a', 0, 0), square('b', 12.5, 0)])];
    expect(flattenDisjointGroups(apart)).not.toBe(apart);
  });
});
