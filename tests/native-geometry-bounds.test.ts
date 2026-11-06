import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { nativeExportBounds } from '../src/game/native-geometry-bounds';
import {
  includeNativeVertices,
  nativeScenePoses,
  type NativeMeshGraph,
  type NativeScenePose,
} from '../src/game/native-mesh';

function graph(): NativeMeshGraph {
  return {
    exports: { root: 0, empty: 4 },
    shapes: {
      3: [[0, [0, 0, 0, 0, 0, 3, 0, 1, 2, 0, 1, 0, 2, 3, 1, 1]]],
      4: [],
    },
    clips: {
      0: {
        fps: 24,
        children: [1, 4],
        names: ['turret', 'empty'],
        blending: [0, 0],
        frames: [
          [[0, 0, 0]],
          [
            [0, 1, 0],
            [1, 0, 0],
          ],
        ],
        timeline: [0, 1],
      },
      1: {
        fps: 15,
        children: [3],
        names: ['tip'],
        blending: [0],
        frames: [[[0, 0, 0]], [[0, 2, 0]]],
        timeline: [0, 1],
      },
    },
    matrices: [
      [1, 0, 0, 0, 1, 0],
      [1, 0, 10, 0, 1, 0],
      [-1, 2, 4, 0.5, -2, -3],
    ],
    colors: [[1, 1, 1, 1, 0, 0, 0, 0]],
    textures: { 0: { path: 'unused.png', width: 1, height: 1 } },
  };
}

function sampledBounds(
  poses: readonly NativeScenePose[],
  bounds = [Infinity, Infinity, -Infinity, -Infinity],
) {
  for (const pose of poses) {
    if ('group' in pose) sampledBounds(pose.group, bounds);
    else includeNativeVertices(pose, bounds);
  }
  return bounds;
}

it('includes independent child phases, shear, reflection and every parent placement', () => {
  const source = graph();
  expect(nativeExportBounds(source, 'root')).toEqual([0, -9, 20, 3]);
  for (const controls of [{}, { turret: 0 }, { turret: 1 }, { turret: false }] as const)
    for (const time of [0, 1 / 24, 2 / 24, 0.5, 1, 5, 101]) {
      const b = sampledBounds(nativeScenePoses(source, 'root', time, controls));
      expect(b[0]).toBeGreaterThanOrEqual(0);
      expect(b[1]).toBeGreaterThanOrEqual(-9);
      expect(b[2]).toBeLessThanOrEqual(20);
      expect(b[3]).toBeLessThanOrEqual(3);
    }
});

it('keeps empty and unknown exports distinct and isolates graph caches', () => {
  const first = graph(),
    second = graph();
  second.matrices[1][2] = 100;
  const bounds = nativeExportBounds(first, 'root');
  expect(nativeExportBounds(first, 'root')).toBe(bounds);
  expect(nativeExportBounds(second, 'root')).toEqual([0, -9, 110, 3]);
  expect(nativeExportBounds(first, 'empty')).toBe(false);
  expect(nativeExportBounds(first, 'absent')).toBeUndefined();
});

it.each(['cycle', 'missing child', 'missing matrix', 'nonfinite vertex', 'overflow'])(
  'fails open for %s',
  (fault) => {
    const source = graph();
    if (fault === 'cycle') source.clips[1].children[0] = 0;
    if (fault === 'missing child') source.clips[1].children[0] = 99;
    if (fault === 'missing matrix') source.clips[1].frames[0][0][1] = 99;
    if (fault === 'nonfinite vertex') source.shapes[3][0][1][0] = NaN;
    if (fault === 'overflow') source.matrices[0][0] = Number.MAX_VALUE;
    expect(nativeExportBounds(source, 'root')).toBeUndefined();
  },
);

it.each(['wall', 'townhall', 'goldmine', 'elixirstorage'])(
  'encloses sampled source %s geometry across states and resource controls',
  (kind) => {
    const pack = JSON.parse(
      readFileSync(`public/assets/village-native/${kind}/graph.json`, 'utf8'),
    ) as {
      scenes: Record<string, NativeMeshGraph>;
      levels: { refs: Record<string, { scene: string; export: string }> }[];
    };
    for (const row of [
      pack.levels[0],
      pack.levels[Math.floor(pack.levels.length / 2)],
      pack.levels.at(-1)!,
    ])
      for (const ref of Object.values(row.refs)) {
        const source = pack.scenes[ref.scene];
        const extent = nativeExportBounds(source, ref.export);
        expect(extent).not.toBeUndefined();
        if (!extent) continue;
        for (const time of [0, 0.1, 0.5, 1, 3, 12])
          for (const controls of [{}, { resource: 200 }]) {
            const b = sampledBounds(nativeScenePoses(source, ref.export, time, controls));
            expect(b[0]).toBeGreaterThanOrEqual(extent[0] - 1e-8);
            expect(b[1]).toBeGreaterThanOrEqual(extent[1] - 1e-8);
            expect(b[2]).toBeLessThanOrEqual(extent[2] + 1e-8);
            expect(b[3]).toBeLessThanOrEqual(extent[3] + 1e-8);
          }
      }
  },
);
