import { expect, it } from 'vitest';
import {
  nativeScenePoses,
  nativeScenePosesShared,
  type NativeMatrix,
  type NativeMeshGraph,
} from '../src/game/native-mesh';

function graph(fps = 1): NativeMeshGraph {
  return {
    exports: { test: 1 },
    shapes: { 3: [[0, [0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0]]] },
    clips: {
      1: {
        fps,
        children: [2, 2],
        names: ['continuous', 'reappearing'],
        blending: [0, 0],
        frames: [true, true, false, true, true, true].map((shown) =>
          shown
            ? [
                [0, 0, 0],
                [1, 0, 0],
              ]
            : [[0, 0, 0]],
        ),
        timeline: [0, 1, 2, 3, 4, 5],
      },
      2: {
        fps: 1,
        children: [3],
        names: [''],
        blending: [0],
        frames: Array.from({ length: 8 }, (_, frame) => [[0, frame, 0]]),
        timeline: [0, 1, 2, 3, 4, 5, 6, 7],
      },
    },
    matrices: Array.from({ length: 8 }, (_, frame) => [1, 0, frame * 10, 0, 1, 0]),
    colors: [[1, 1, 1, 1, 0, 0, 0, 0]],
    textures: {},
  };
}

it('shares a complete nested loop while retaining first-loop clocks and rewinds', () => {
  const source = graph();
  const first = nativeScenePosesShared(source, 'test', 0);
  const later = nativeScenePosesShared(source, 'test', 24);
  // The reappearing child starts at age zero, then inherits age three across the wrap.
  expect(later).not.toEqual(first);
  expect(nativeScenePosesShared(source, 'test', 0)).toBe(first);
  const repeated = nativeScenePosesShared(source, 'test', 8);
  expect(nativeScenePosesShared(source, 'test', 32)).toBe(repeated);
  for (const seconds of [0, 6, 8, 12, 24, 32, 1000, 6, 0])
    expect(nativeScenePosesShared(source, 'test', seconds)).toEqual(
      nativeScenePoses(source, 'test', seconds),
    );
});

it('combines parent and child clocks with different integer frame rates', () => {
  const source = graph(2);
  source.clips[2].fps = 3;
  const a = nativeScenePosesShared(source, 'test', 3);
  expect(nativeScenePosesShared(source, 'test', 6)).not.toEqual(a);
  // 48 parent frames advance both the six-frame parent and eight-frame child completely.
  expect(nativeScenePosesShared(source, 'test', 27)).toBe(a);
  for (const seconds of [0, 3, 6, 27, 51, 1000])
    expect(nativeScenePosesShared(source, 'test', seconds)).toEqual(
      nativeScenePoses(source, 'test', seconds),
    );
});

it('keeps named controls and root transforms separate when loop samples are shared', () => {
  const source = graph();
  const controls = { continuous: 3, reappearing: false } as const;
  const root: NativeMatrix = [-0.6, 0.1, 17, -0.2, 0.6, 9];
  const a = nativeScenePosesShared(source, 'test', 8, controls, root);
  expect(nativeScenePosesShared(source, 'test', 32, controls, [...root])).toBe(a);
  expect(a).toEqual(nativeScenePoses(source, 'test', 32, controls, root));
  expect(nativeScenePosesShared(source, 'test', 32)).not.toEqual(a);
  expect(nativeScenePosesShared(source, 'test', 32, { continuous: 4 }, root)).not.toEqual(a);
});

it('leaves unsupported fractional clocks and very old clocks on their raw cache keys', () => {
  const source = graph(1.5);
  const a = nativeScenePosesShared(source, 'test', 8 / 1.5);
  const b = nativeScenePosesShared(source, 'test', 20 / 1.5);
  expect(b).toEqual(a);
  expect(b).not.toBe(a);
  const ordinary = graph();
  const old = nativeScenePosesShared(ordinary, 'test', 1_000_000_001);
  const older = nativeScenePosesShared(ordinary, 'test', 1_000_000_025);
  expect(older).toEqual(old);
  expect(older).not.toBe(old);
});

it('keeps the existing cache bound across distinct root transforms', () => {
  const source = graph();
  const first = nativeScenePosesShared(source, 'test', 8);
  for (let x = 1; x <= 512; x++) nativeScenePosesShared(source, 'test', 8, {}, [1, 0, x, 0, 1, 0]);
  const again = nativeScenePosesShared(source, 'test', 8);
  expect(again).toEqual(first);
  expect(again).not.toBe(first);
});

it('keeps raw keys when independent loops exceed the metadata budget', () => {
  const source = graph();
  source.clips[1].timeline = Array(127).fill(0);
  source.clips[2].timeline = Array.from({ length: 89 }, (_, frame) => frame % 8);
  const first = nativeScenePosesShared(source, 'test', 127);
  const repeated = nativeScenePosesShared(source, 'test', 127 + 127 * 89);
  expect(repeated).toEqual(first);
  expect(repeated).not.toBe(first);
});

it('leaves controlled cycles to the original sampler rather than recursing in metadata', () => {
  const source = graph();
  source.clips[2].children[0] = 1;
  source.clips[2].names[0] = 'stop';
  const hidden = { stop: false } as const;
  const a = nativeScenePosesShared(source, 'test', 8, hidden);
  const b = nativeScenePosesShared(source, 'test', 32, hidden);
  expect(a).toEqual([]);
  expect(b).toEqual(a);
  expect(b).not.toBe(a);
  expect(() => nativeScenePosesShared(source, 'test', 8)).toThrow('Recursive native scene');
});
