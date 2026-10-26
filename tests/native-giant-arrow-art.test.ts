import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import effectArt from '../reference/full-client/effect-art.json';
import type { NativeArtPack } from '../src/game/native-art-pack';
import {
  nativeScenePoses,
  type NativeScenePose,
  type NativeMeshPose,
} from '../src/game/native-mesh';
import { nativeTrailPoses } from '../src/game/native-effects';
import {
  nativePiercingFlight,
  nativeProjectilePack,
  nativeProjectilePoses,
  type NativeProjectilePack,
} from '../src/game/native-projectile-poses';
import { heroProjectileNames } from '../src/game/hero-projectile-prefetch';

const read = <T>(path: string): T => JSON.parse(readFileSync('public/' + path, 'utf8'));
const pack = read<NativeProjectilePack>(nativeProjectilePack('QueenPierceProjectile')!);
const row = pack.projectiles.QueenPierceProjectile;
const trail = read<NativeArtPack>(
  effectArt.packs[effectArt.effects.Hero_Equip_AQ_Giant_Arrow_Trail].path,
);
const leaves = (poses: NativeScenePose[]): NativeMeshPose[] =>
  poses.flatMap((p) => ('group' in p ? leaves(p.group) : [p]));
const shot = { fromX: 10, fromY: 10, dirX: 1, dirY: 0, length: 20, speed: 35, launched: 2 };
const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });

it('keeps the source visual launch offset out of the physical ray and lands at the map endpoint', () => {
  expect(row).toMatchObject({ StartOffset: '25', StartHeight: '30', UseTopLayer: 'TRUE' });
  const start = nativePiercingFlight(row, shot, 2, iso);
  expect(start.ground).toEqual(iso(10.25, 10));
  expect(start.height).toBe(24);
  const end = nativePiercingFlight(row, shot, 2 + 20 / 35, iso);
  expect(end.ground.x).toBeCloseTo(iso(30, 10).x, 9);
});

it('plays the original animated child of the static arrow root without altering legacy clocks', () => {
  const graph = pack.scenes.buildings;
  expect(graph.clips[graph.exports[row.ExportName]].timeline).toHaveLength(1);
  expect(Object.values(graph.clips).some((clip) => clip.timeline.length === 10)).toBe(true);
  const flight = { ...nativePiercingFlight(row, shot, 2.25, iso), rotation: 0 };
  const before = JSON.stringify(pack);
  const original = nativeProjectilePoses(pack, row, flight, 2.25, 2, true).poses;
  expect(original).toEqual(
    nativeScenePoses(graph, row.ExportName, 0.25, {}, [1.2, -0, 0, 0, 1.2, 0]),
  );
  expect(original).not.toEqual(nativeProjectilePoses(pack, row, flight, 2.25, 2).poses);
  nativeProjectilePoses(pack, row, flight, 2.35, 2, true);
  expect(nativeProjectilePoses(pack, row, flight, 2.25, 2, true).poses).toEqual(original);
  expect(leaves(original).length).toBeGreaterThan(0);
  expect(leaves(original).every((p) => [...p.matrix, ...p.vertices].every(Number.isFinite))).toBe(
    true,
  );
  expect(JSON.stringify(pack)).toBe(before);
});

it.each(['hero_equip_aq_giant_arrow_trail_emitter01', 'hero_equip_aq_giant_arrow_trail_emitter02'])(
  '%s uses the source effect scale and 70-percent lifetime without changing existing trails',
  (name) => {
    const source = trail.effects.Hero_Equip_AQ_Giant_Arrow_Trail[0];
    expect(source).toMatchObject({ Scale: '120', LifeTimeScale: '70' });
    const birth = [{ index: 0, at: 0, ground: { x: 0, y: 0 } }];
    const before = JSON.stringify(trail);
    const sample = (at: number, sourceRows = true, reduced = false) =>
      nativeTrailPoses(
        trail,
        name,
        'giant-arrow:source',
        birth,
        at,
        reduced,
        { x: 1, y: 0 },
        8000,
        sourceRows ? { scale: 1.2, timeScale: 0.7 } : undefined,
      );
    const actual = leaves(sample(0.35).flatMap((p) => p.poses));
    const baseline = leaves(sample(0.5, false).flatMap((p) => p.poses));
    expect(actual.length).toBeGreaterThan(0);
    expect(actual.length).toBe(baseline.length);
    for (const [i, pose] of actual.entries())
      for (const [j, value] of pose.matrix.entries())
        expect(value).toBeCloseTo(baseline[i].matrix[j] * 1.2, 6);
    expect(sample(0.701)).toEqual([]);
    expect(sample(0.701, false).length).toBeGreaterThan(0);
    expect(sample(0.35, true, true)).toEqual([]);
    expect(JSON.stringify(trail)).toBe(before);
  },
);

it('prefetches the original activation arrow only for the new equipped-Queen controller', () => {
  const heroes = [
    { kind: 'queen' as const, level: 1, items: [{ slug: 'piercing-arrow', level: 18 }] },
  ];
  expect(heroProjectileNames(heroes)).not.toContain('QueenPierceProjectile');
  expect(heroProjectileNames(heroes, false, false, true)).toContain('QueenPierceProjectile');
});
