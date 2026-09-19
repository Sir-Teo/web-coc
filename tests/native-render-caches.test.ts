import { expect, it } from 'vitest';
import raw from '../reference/tesla/runtime.json';
import {
  includeNativeVertices,
  nativeMeshPoses,
  nativeMeshPosesShared,
  nativeScenePoses,
  nativeScenePosesShared,
  nativeVertices,
  type NativeMatrix,
  type NativeMeshGraph,
  type NativeMeshPose,
  type NativeScenePose,
} from '../src/game/native-mesh';
import { nativeEffectRow } from '../src/game/native-effects';

const graph = raw as unknown as NativeMeshGraph;
const root: NativeMatrix = [1.2, 0, 10, 0, 1.2, -4];

it('shares identical scene samples within one source frame and matches a fresh sample', () => {
  const a = nativeScenePosesShared(graph, 'teslatower_lvl10_setup', 8 / 24, {}, root);
  // Same integer source frame (24 fps): same array, not a re-sample.
  const b = nativeScenePosesShared(graph, 'teslatower_lvl10_setup', 8 / 24 + 0.01, {}, [...root]);
  expect(b).toBe(a);
  expect(a).toEqual(nativeScenePoses(graph, 'teslatower_lvl10_setup', 8 / 24, {}, root));
  const next = nativeScenePosesShared(graph, 'teslatower_lvl10_setup', 9 / 24, {}, root);
  expect(next).not.toBe(a);
  const moved = nativeScenePosesShared(
    graph,
    'teslatower_lvl10_setup',
    8 / 24,
    {},
    [1.2, 0, 11, 0, 1.2, -4],
  );
  expect(moved).not.toBe(a);
  const mesh = nativeMeshPosesShared(graph, 'teslatower_lvl1', 0.2, {}, root);
  expect(mesh).toEqual(nativeMeshPoses(graph, 'teslatower_lvl1', 0.2, {}, root));
});

it('folds a root alpha into the top-level poses exactly like scaling them afterwards', () => {
  const plain = nativeScenePoses(graph, 'teslatower_lvl10_setup', 8 / 24, {}, root);
  const faded = nativeScenePoses(graph, 'teslatower_lvl10_setup', 8 / 24, {}, root, 0.5);
  expect(faded).toHaveLength(plain.length);
  for (const [i, pose] of faded.entries()) {
    expect(pose.multiply[3]).toBeCloseTo(plain[i].multiply[3] * 0.5, 12);
    expect(pose.multiply.slice(0, 3)).toEqual(plain[i].multiply.slice(0, 3));
    expect(pose.add).toEqual(plain[i].add);
  }
});

it('computes transformed leaf bounds without allocating vertex copies', () => {
  const leaves = (poses: readonly NativeScenePose[]): NativeMeshPose[] =>
    poses.flatMap((p) => ('group' in p ? leaves(p.group) : [p]));
  const all = leaves(nativeScenePoses(graph, 'teslatower_lvl10_setup', 8 / 24, {}, root));
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const leaf of all) includeNativeVertices(leaf, bounds);
  const xs = all.flatMap((l) => nativeVertices(l).filter((_, i) => i % 4 === 0));
  const ys = all.flatMap((l) => nativeVertices(l).filter((_, i) => i % 4 === 1));
  expect(bounds).toEqual([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
});

it('merges continuation effect rows once and keeps returning the same row', () => {
  const rows = [
    { ParticleEmitter: 'a', Scale: '120', OffsetX: '3' },
    { ParticleEmitter: 'b', OffsetX: '5' },
  ];
  const first = nativeEffectRow(rows, 1);
  expect(first).toEqual({ ParticleEmitter: 'b', Scale: '120', OffsetX: '5' });
  expect(nativeEffectRow(rows, 1)).toBe(first);
});
