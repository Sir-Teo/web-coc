import { expect, it } from 'vitest';
import raw from '../reference/xbow/runtime.json';
import witness from './fixtures/native-xbow-mesh/manifest.json';
import {
  nativeMatrix,
  nativeMeshPoses,
  nativeTriangles,
  nativeVertices,
  type NativeMatrix,
  type NativeMeshGraph,
} from '../src/game/native-mesh';

const graph = raw as unknown as NativeMeshGraph;
it.each(witness.cases)('matches the Python source poses for $export at $time seconds', (c) => {
  const poses = nativeMeshPoses(
    graph,
    c.export,
    c.time,
    { turret: c.direction, ammo: c.direction },
    c.root as NativeMatrix,
  );
  expect(poses).toHaveLength(c.poses.length);
  for (const [i, pose] of poses.entries()) {
    const original = c.poses[i];
    expect(pose.texture).toBe(original.texture);
    expect(pose.blend).toBe(original.blend);
    expect(pose.vertices).toEqual(original.vertices);
    for (const field of ['matrix', 'multiply', 'add'] as const)
      for (const [j, value] of pose[field].entries())
        expect(value).toBeCloseTo(original[field][j], 10);
  }
});

it('keeps aiming controls fixed across time while selecting a new source view explicitly', () => {
  const a = nativeMeshPoses(graph, 'rapidfire_turret_lvl3', 0, { turret: 70, ammo: 70 });
  const b = nativeMeshPoses(graph, 'rapidfire_turret_lvl3', 1000, { turret: 70, ammo: 70 });
  const c = nativeMeshPoses(graph, 'rapidfire_turret_lvl3', 0, { turret: 170, ammo: 170 });
  expect(b).toEqual(a);
  expect(c).not.toEqual(a);
  expect(nativeMeshPoses(graph, 'rapidfire_turret_lvl3', 0, { turret: 430, ammo: 430 })).toEqual(a);
  expect(new Set(a.map((p) => p.key)).size).toBe(a.length);
});

it('keeps color variants, additive instances and removal distinct while rewinding', () => {
  const first = nativeMeshPoses(graph, 'rapidfire_arrow_ammo_lvl7', 0);
  const later = nativeMeshPoses(graph, 'rapidfire_arrow_ammo_lvl7', 0.6);
  expect(later).not.toEqual(first);
  expect(first.some((p) => p.blend === 8)).toBe(true);
  expect(later.some((p) => p.add.some((v) => v > 0))).toBe(true);
  expect(nativeMeshPoses(graph, 'rapidfire_arrow_ammo_lvl7', 0)).toEqual(first);
  expect(nativeMeshPoses(graph, 'rapidfire_turret_lvl3_upgrade', 0).length).toBeLessThan(
    nativeMeshPoses(graph, 'rapidfire_turret_lvl3', 0).length,
  );
});

it('hides only the named ammunition instance while retaining the armed base and turret', () => {
  const armed = nativeMeshPoses(graph, 'rapidfire_turret_lvl13', 0, { turret: 225, ammo: 225 });
  const empty = nativeMeshPoses(graph, 'rapidfire_turret_lvl13', 0, { turret: 225, ammo: false });
  expect(empty.length).toBeLessThan(armed.length);
  expect(empty.length).toBeGreaterThan(0);
  for (const pose of empty) expect(armed.find((p) => p.key === pose.key)).toEqual(pose);
  expect(nativeMeshPoses(graph, 'rapidfire_turret_lvl13', 0, { turret: 225, ammo: 225 })).toEqual(
    armed,
  );
});

it('preserves complete affine transforms, strip cutouts and normalized UVs', () => {
  const pose = nativeMeshPoses(graph, 'rapidfire_turret_lvl1', 0)[0];
  pose.matrix = [2, 0.5, 17, -0.2, 3, 19];
  const vertices = nativeVertices(pose);
  for (let i = 0; i < vertices.length; i += 4) {
    const [x, y, u, v] = pose.vertices.slice(i, i + 4);
    expect(vertices.slice(i, i + 4)).toEqual([2 * x + 0.5 * y + 17, -0.2 * x + 3 * y + 19, u, v]);
  }
  expect(nativeTriangles(Array(24).fill(0))).toEqual([
    0, 1, 2, 0, 2, 1, 3, 0, 2, 3, 4, 0, 4, 3, 5, 0,
  ]);
  expect(nativeMatrix([2, 0.5, 17, -0.2, 3, 19], [1, 0, 5, 0, 1, 7])).toEqual([
    2, 0.5, 30.5, -0.2, 3, 39,
  ]);
});

it('bounds placement lookup by the source timeline even at a very old battle clock', () => {
  let reads = 0;
  const frames = new Proxy([[[0, 0, 0]]], {
    get(target, key, receiver) {
      if (++reads > 100) throw Error('Placement scan depends on battle age');
      return Reflect.get(target, key, receiver);
    },
  });
  const tiny: NativeMeshGraph = {
    exports: { test: 1 },
    shapes: { 2: [[0, [0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0]]] },
    clips: { 1: { fps: 30, children: [2], names: [''], blending: [0], frames, timeline: [0] } },
    matrices: [[1, 0, 0, 0, 1, 0]],
    colors: [[1, 1, 1, 1, 0, 0, 0, 0]],
    textures: {},
  };
  expect(nativeMeshPoses(tiny, 'test', 1e12)).toEqual(nativeMeshPoses(tiny, 'test', 0));
  expect(reads).toBeLessThan(100);
});

it('rejects unsupported composition and missing exports without silently approximating them', () => {
  expect(() => nativeMeshPoses(graph, 'missing', 0)).toThrow('Unknown native export');
  const altered = structuredClone(graph);
  const root = altered.clips[altered.exports.rapidfire_turret_lvl3];
  root.blending[root.names.indexOf('turret')] = 8;
  expect(() => nativeMeshPoses(altered, 'rapidfire_turret_lvl3', 0)).toThrow(
    'isolated compositing',
  );
});
