import { expect, it } from 'vitest';
import raw from '../reference/tesla/runtime.json';
import witness from './fixtures/native-tesla-mesh/manifest.json';
import {
  nativeMeshPoses,
  nativeScenePoses,
  type NativeMatrix,
  type NativeMeshGraph,
  type NativeScenePose,
} from '../src/game/native-mesh';

const graph = raw as unknown as NativeMeshGraph;
function compare(actual: NativeScenePose[], expected: NativeScenePose[]) {
  expect(actual).toHaveLength(expected.length);
  for (const [i, pose] of actual.entries()) {
    const other = expected[i];
    expect(pose.key).toBe(other.key);
    expect(pose.blend).toBe(other.blend);
    for (const field of ['multiply', 'add'] as const)
      for (const [j, value] of pose[field].entries())
        expect(value).toBeCloseTo(other[field][j], 10);
    if ('group' in pose) {
      expect('group' in other).toBe(true);
      if ('group' in other) compare(pose.group, other.group);
    } else {
      expect('group' in other).toBe(false);
      if (!('group' in other)) {
        expect(pose.texture).toBe(other.texture);
        expect(pose.vertices).toEqual(other.vertices);
        for (const [j, value] of pose.matrix.entries())
          expect(value).toBeCloseTo(other.matrix[j], 10);
      }
    }
  }
}
it.each(witness.cases)('matches the independent source composition for $export at $time', (c) => {
  compare(
    nativeScenePoses(graph, c.export, c.time, {}, c.root as NativeMatrix).map((p) => {
      if (c.particleBlend === null) return p;
      if ('group' in p) {
        expect(c.particleBlend).toBe(8);
        return { ...p, blend: 8 as const };
      }
      return { ...p, blend: c.particleBlend as 0 | 8 };
    }),
    c.poses as NativeScenePose[],
  );
});

it.each([3, 4, 8] as const)(
  'keeps children and color changes isolated inside blend mode %i',
  (blend) => {
    const changed = structuredClone(graph);
    const root = changed.clips[changed.exports.teslatower_lvl10_setup];
    const slot = root.names.indexOf('idle_electricity');
    root.blending[slot] = blend;
    const placement = root.frames[0].find((p) => p[0] === slot)!;
    changed.colors.push([1, 1, 1, 0.4, 0, 0, 0, 0]);
    placement[2] = changed.colors.length - 1;
    const poses = nativeScenePoses(changed, 'teslatower_lvl10_setup', 8 / 24);
    const group = poses.find((p) => 'group' in p)!;
    expect(group.blend).toBe(blend);
    expect(group.multiply[3]).toBe(0.4);
    if ('group' in group) {
      expect(new Set(group.group.map((p) => p.blend))).toEqual(new Set([0, 8]));
      const original = nativeScenePoses(graph, 'teslatower_lvl10_setup', 8 / 24).find(
        (p) => 'group' in p,
      )!;
      expect(group.group).toEqual('group' in original ? original.group : undefined);
    }
    expect(() => nativeMeshPoses(changed, 'teslatower_lvl10_setup', 8 / 24)).toThrow(
      'isolated compositing',
    );
    changed.colors.at(-1)![4] = 0.2;
    const colored = nativeScenePoses(changed, 'teslatower_lvl10_setup', 8 / 24).find(
      (p) => 'group' in p,
    )!;
    expect(colored.add).toEqual([0.2, 0, 0, 0]);
    expect('group' in colored && colored.group).toEqual('group' in group && group.group);
    changed.colors.at(-1)![7] = 0.2;
    expect(() => nativeScenePoses(changed, 'teslatower_lvl10_setup', 8 / 24)).toThrow('alpha');
  },
);

it('keeps every setup/reveal timeline seekable while idle controls can be hidden independently', () => {
  for (const row of raw.levels) {
    for (let frame = 0; frame < 192; frame++) nativeScenePoses(graph, row.ExportName, frame / 24);
    for (let frame = 0; frame < 18; frame++)
      nativeScenePoses(graph, row.ExportNameTriggered, frame / 24);
    const first = nativeScenePoses(graph, row.ExportName, 8 / 24);
    nativeScenePoses(graph, row.ExportName, 1e9);
    expect(nativeScenePoses(graph, row.ExportName, 8 / 24)).toEqual(first);
    expect(nativeScenePoses(graph, row.ExportName, 8 / 24, { idle_electricity: false })).toEqual(
      nativeMeshPoses(graph, row.ExportName, 8 / 24, { idle_electricity: false }),
    );
  }
});

it('isolates all commands of a multiply shape before destination composition', () => {
  const vertices = [0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0];
  const source: NativeMeshGraph = {
    exports: { test: 2 },
    shapes: {
      1: [
        [0, vertices],
        [0, vertices],
      ],
    },
    clips: {
      2: {
        fps: 24,
        children: [1],
        names: [''],
        blending: [3],
        frames: [[[0, 0, 0]]],
        timeline: [0],
      },
    },
    matrices: [[1, 0, 0, 0, 1, 0]],
    colors: [[1, 1, 1, 0.4, 0, 0, 0, 0]],
    textures: {},
  };
  const poses = nativeScenePoses(source, 'test', 0);
  expect(poses).toHaveLength(1);
  const group = poses[0];
  expect(group.blend).toBe(3);
  expect(group.multiply[3]).toBe(0.4);
  expect('group' in group && group.group.map((p) => p.blend)).toEqual([0, 0]);
  expect(() => nativeMeshPoses(source, 'test', 0)).toThrow('isolated compositing');
});
