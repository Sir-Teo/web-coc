import { expect, it } from 'vitest';
import { loadInfernoArt } from '../src/game/inferno-graph';
import {
  infernoDragonBeamProfile,
  infernoDragonBeams,
  infernoDragonBeamPoses,
} from '../src/game/inferno-dragon-beam';
import {
  nativeSceneLocator,
  nativeVertices,
  type NativeMeshGraph,
  type NativeScenePose,
} from '../src/game/native-mesh';
import { nativeDamageRampRecording } from './fixtures/native-damage-ramp';
import type { Battle } from '../src/game/model';
import { nativeTroopFacingTarget } from '../src/game/native-troop-facing';
import { makeBuilding } from '../src/game/model';
import dragon from '../public/assets/troops-native/infernodragon/graph.json';

await loadInfernoArt();
const recording = nativeDamageRampRecording('infernodragon', true);
const snapshot = () => structuredClone(recording.snapshots[2].battle) as Battle;

it('selects the three authored beams and their locator and particle fade', () => {
  for (let stage = 0; stage < 3; stage++)
    expect(infernoDragonBeamProfile(stage)).toMatchObject({
      effect: `Inferno Dragon Attack ${stage + 1}`,
      export: `dbeam_${stage + 1}_light`,
      locator: 'attack_pivot',
      fadeIn: 0.128,
      endZ: 50,
    });
});

it.each([0, 1, 2])('draws source beam stage %s without replacing its textures', (stage) => {
  const vertices = (poses: NativeScenePose[]): number[][] =>
    poses.flatMap((p) => ('group' in p ? vertices(p.group) : [nativeVertices(p)]));
  const a = vertices(infernoDragonBeamPoses(stage, 0.5, { x: 10, y: 20 }, { x: 210, y: 20 }));
  const b = vertices(infernoDragonBeamPoses(stage, 0.5, { x: 10, y: 20 }, { x: 410, y: 20 }));
  expect(a.length).toBeGreaterThan(0);
  expect(b).toHaveLength(a.length);
  for (let i = 0; i < a.length; i++)
    for (let n = 0; n < a[i].length; n += 4) {
      expect(b[i][n] - 10).toBeCloseTo((a[i][n] - 10) * 2, 8);
      expect(b[i][n + 1]).toBeCloseTo(a[i][n + 1], 8);
    }
  expect(infernoDragonBeamPoses(stage, 0.5, { x: 1, y: 2 }, { x: 1, y: 2 })).toEqual([]);
});

it('derives stages and defender endpoints without changing battle state', () => {
  const b = snapshot();
  const before = JSON.stringify(b);
  const beam = infernoDragonBeams(b)[0];
  const target = b.defenders!.find((d) => d.id === recording.firstTargetId)!;
  expect(beam).toMatchObject({
    id: recording.unitId,
    stage: 2,
    target: { x: target.x, y: target.y },
    air: false,
  });
  expect(JSON.stringify(b)).toBe(before);
  const early = structuredClone(recording.snapshots[0].battle) as Battle;
  expect(infernoDragonBeams(early)[0].stage).toBe(0);
  expect(infernoDragonBeams(b)).toEqual([beam]);
});

it.each([
  'dead',
  'ejected',
  'recalled',
  'idle',
  'frozen',
  'stunned',
  'finished',
  'old',
  'target-dead',
  'target-hidden',
  'target-unborn',
  'stale-target',
] as const)('stops the beam for %s', (state) => {
  const b = snapshot(),
    u = b.units.find((u) => u.id === recording.unitId)!;
  const d = b.defenders!.find((d) => d.id === recording.firstTargetId)!;
  if (state === 'dead') u.hp = 0;
  if (state === 'ejected') u.ejected = true;
  if (state === 'recalled') u.native!.recalled = true;
  if (state === 'idle') u.attacking = false;
  if (state === 'frozen') u.native!.effects = { frozenUntil: b.elapsed + 1 };
  if (state === 'stunned') u.native!.effects = { stunUntil: b.elapsed + 1 };
  if (state === 'finished') b.finished = true;
  if (state === 'old') delete b.nativeTroopDamageRamp;
  if (state === 'target-dead') d.hp = 0;
  if (state === 'target-hidden') d.invisibleUntil = b.elapsed + 1;
  if (state === 'target-unborn') d.spawnedAt = b.elapsed + 1;
  if (state === 'stale-target') u.defenderTarget = -999;
  expect(infernoDragonBeams(b)).toEqual([]);
});

it('uses the new target after a kill and resolves building footprint centers', () => {
  const next = structuredClone(recording.snapshots[3].battle) as Battle;
  const u = next.units.find((u) => u.id === recording.unitId)!;
  expect(infernoDragonBeams(next)[0].stage).toBe(0);
  const storage = makeBuilding(5000, 'goldstorage', 20, 20, 1);
  next.buildings.push(storage);
  u.native!.damageRamp = { targetId: storage.id, defender: false, startedAt: next.elapsed };
  u.target = storage.id;
  delete u.defenderTarget;
  const beam = infernoDragonBeams(next)[0];
  expect(beam.target).toEqual({ x: 21.5, y: 21.5 });
  expect(nativeTroopFacingTarget(next, u)).toEqual(beam.target);
});

it('faces a defender before a building destination and respects concealment and an actual blocking Wall', () => {
  const b = snapshot(),
    u = b.units.find((u) => u.id === recording.unitId)!;
  u.target = 1;
  const d = b.defenders!.find((d) => d.id === u.defenderTarget)!;
  expect(nativeTroopFacingTarget(b, u)).toEqual({ x: d.x, y: d.y });
  d.invisibleUntil = b.elapsed + 1;
  expect(nativeTroopFacingTarget(b, u)).toEqual({ x: 38, y: 38 });
  const wall = makeBuilding(5000, 'wall', 12, 14, 1);
  b.buildings.push(wall);
  u.native!.wallTarget = wall.id;
  expect(nativeTroopFacingTarget(b, u)).toEqual({ x: 12.5, y: 14.5 });
});

it('finds the authored mouth locator in every Inferno Dragon attack direction and tier', () => {
  const pack = dragon as unknown as {
    levels: { states: Record<string, { scene: string; exports: string[] }> }[];
    scenes: Record<string, NativeMeshGraph>;
  };
  for (const level of pack.levels)
    for (const name of level.states.attack.exports)
      for (const at of [0, 0.1, 0.5]) {
        const matrix = nativeSceneLocator(
          pack.scenes[level.states.attack.scene],
          name,
          at,
          'attack_pivot',
        );
        expect(matrix, name).toHaveLength(6);
        expect(matrix!.every(Number.isFinite)).toBe(true);
      }
});

it('samples named locator matrices with nested timeline rates, control overrides and root transforms', () => {
  const graph = {
    exports: { body: 1 },
    shapes: {},
    textures: {},
    colors: [],
    matrices: [
      [1, 0, 10, 0, 1, 20],
      [1, 0, 3, 0, 1, 4],
      [1, 0, 8, 0, 1, 9],
    ],
    clips: {
      1: {
        fps: 2,
        children: [2],
        names: ['head'],
        blending: [0],
        timeline: [0, 0, 0, 0],
        frames: [[[0, 0, 0]]],
      },
      2: {
        fps: 1,
        children: [3],
        names: ['mouth'],
        blending: [0],
        timeline: [0, 1],
        frames: [[[0, 1, 0]], [[0, 2, 0]]],
      },
    },
  } as unknown as NativeMeshGraph;
  expect(nativeSceneLocator(graph, 'body', 0, 'mouth')).toEqual([1, 0, 13, 0, 1, 24]);
  expect(nativeSceneLocator(graph, 'body', 1, 'mouth')).toEqual([1, 0, 18, 0, 1, 29]);
  expect(nativeSceneLocator(graph, 'body', 0, 'mouth', { head: 1 })).toEqual([1, 0, 18, 0, 1, 29]);
  expect(nativeSceneLocator(graph, 'body', 0, 'mouth', { head: false })).toBeUndefined();
  expect(nativeSceneLocator(graph, 'body', 0, 'missing')).toBeUndefined();
  expect(nativeSceneLocator(graph, 'body', 0, 'mouth', {}, [-2, 0, 100, 0, 2, 200])).toEqual([
    -2, 0, 74, 0, 2, 248,
  ]);
});
