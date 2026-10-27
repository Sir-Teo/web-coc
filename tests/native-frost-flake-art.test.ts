import { expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import source from '../reference/frost-flake/effects.json';
import manifest from '../reference/full-client/manifest.json';
import type { NativeArtPack } from '../src/game/native-art-pack';
import { nativeEffectDuration, nativeEffectPoses } from '../src/game/native-effects';
import {
  nativeProjectileFlight,
  nativeProjectilePack,
  nativeProjectilePoses,
  type NativeProjectilePack,
} from '../src/game/native-projectile-poses';
import { nativeScenePoses, type NativeScenePose } from '../src/game/native-mesh';
import { FROST_FLAKE_PRESENTATION, frostFlakeEffectEvents } from '../src/game/frost-flake-effects';
import { BattleSoundLog, troopSoundCues } from '../src/game/troop-sounds';
import { heroProjectileNames } from '../src/game/hero-projectile-prefetch';
import { frostFlakeBattle } from './fixtures/native-frost-flake';

const read = <T>(path: string): T => JSON.parse(readFileSync('public/' + path, 'utf8'));
const activation = read<NativeArtPack>(source.packs['frost-flake'].path);
const flightPack = read<NativeProjectilePack>(
  nativeProjectilePack(source.profile.ProjectileOnActivation)!,
);
const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });
const leaves = (poses: NativeScenePose[]): number =>
  poses.reduce((n, p) => n + ('group' in p ? leaves(p.group) : 1), 0);
const duration = (name: string) => nativeEffectDuration(activation, name, Infinity);

it('pins all activation sources, graph bytes and the complete owned-file total', () => {
  expect(source.ability).toBe('FrostBlast');
  expect(source.abilityLevelCount).toBe(10);
  const pins = new Map(manifest.files.map((entry) => [entry.path, entry.sha256]));
  for (const [path, hash] of Object.entries(source.sources))
    expect(pins.get(path), path).toBe(hash);
  const pack = source.packs['frost-flake'];
  expect(
    createHash('sha256')
      .update(readFileSync('public/' + pack.path))
      .digest('hex'),
  ).toBe(pack.sha256);
  const folder = dirname('public/' + pack.path);
  const bytes = readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .reduce((sum, entry) => sum + statSync(join(entry.parentPath, entry.name)).size, 0);
  expect(bytes).toBe(pack.bytes);
});

it('retains a wasted activation with original stationary art, source cue and readable official name', () => {
  const { model, battle, championId, until } = frostFlakeBattle();
  battle.buildingEffects = Object.fromEntries(
    battle.buildings.map((b) => [b.id, { invisibleUntil: 100 }]),
  );
  const fx: import('../src/game/model').FX[] = [];
  model.onEffect = (event) => fx.push(event);
  model.activateNativeHeroAbility('champion');
  const cast = battle.nativeFrostFlakeCasts![0];
  expect(cast.shots).toEqual([]);
  expect(fx.find((event) => event.abilityCastId === cast.id)).toMatchObject({
    text: 'FROST FLAKE',
    at: cast.at,
  });
  until(0.15);
  const before = JSON.stringify(battle);
  const events = frostFlakeEffectEvents(battle, iso, duration);
  expect(events).toHaveLength(1);
  expect(events[0].ground).toEqual(iso(cast.x, cast.y));
  expect(
    events
      .flatMap((e) => nativeEffectPoses(activation, e, battle.elapsed, false))
      .reduce((n, p) => n + leaves(p.poses), 0),
  ).toBeGreaterThan(0);
  expect(events.flatMap((e) => nativeEffectPoses(activation, e, battle.elapsed, true))).toEqual([]);
  const cues = troopSoundCues(battle, new BattleSoundLog()).filter((c) =>
    c.key.startsWith(cast.id),
  );
  expect(cues).toHaveLength(1);
  expect(cues[0]).toMatchObject({ key: `${cast.id}:sound`, at: cast.at, volume: 1, pitch: 1 });
  expect(JSON.stringify(battle)).toBe(before);
  battle.units.find((u) => u.id === championId)!.x += 1;
  expect(frostFlakeEffectEvents(battle, iso, duration)[0].ground).toEqual(events[0].ground);
  until(0.55);
  expect(frostFlakeEffectEvents(battle, iso, duration)).toEqual([]);
});

it('fits the original twelve-frame descendant to the flake flight timeline', () => {
  const row = flightPack.projectiles[source.profile.ProjectileOnActivation],
    graph = flightPack.scenes.buildings;
  expect(row).toMatchObject({ ScaleTimeline: 'TRUE', Scale: '80' });
  expect(graph.clips[graph.exports[row.ExportName]].timeline).toHaveLength(1);
  expect(Object.values(graph.clips).some((c) => c.timeline.length === 12)).toBe(true);
  const shot = { fromX: 0, fromY: 0, x: 15, y: 0, launched: 0, impact: 1 };
  const flight = { ...nativeProjectileFlight(row, shot, 0.5, { iso, airLift: 46 }), rotation: 0 };
  const before = JSON.stringify(flightPack);
  const poses = nativeProjectilePoses(flightPack, row, flight, 0.5, 0, {
    nestedTimeline: true,
  }).poses;
  expect(poses).toEqual(
    nativeScenePoses(graph, row.ExportName, 0.25, {}, [0.96, -0, 0, 0, 0.96, 0]),
  );
  expect(poses).not.toEqual(nativeProjectilePoses(flightPack, row, flight, 0.5, 0).poses);
  expect(leaves(poses)).toBeGreaterThan(0);
  expect(JSON.stringify(flightPack)).toBe(before);
});

it('uses the declared impact take, volume and pitch at the scheduled arrival, once per packet', () => {
  const { model, battle, until } = frostFlakeBattle();
  model.activateNativeHeroAbility('champion');
  const shot = battle.nativeFrostFlakeCasts![0].shots[0];
  until(shot.impact + 0.01);
  const before = JSON.stringify(battle);
  const cues = troopSoundCues(battle, new BattleSoundLog()).filter(
    (c) => c.key === `${shot.id}:sound`,
  );
  expect(cues).toHaveLength(1);
  expect(cues[0]).toMatchObject({ at: shot.impact, volume: 0.5 });
  expect(cues[0].pitch).toBeGreaterThanOrEqual(0.9);
  expect(cues[0].pitch).toBeLessThanOrEqual(1.1);
  expect(
    troopSoundCues(battle, new BattleSoundLog()).filter((c) => c.key === `${shot.id}:sound`),
  ).toEqual(cues);
  expect(JSON.stringify(battle)).toBe(before);
});

it('warms the activation projectile only with the source Frost Flake controller', () => {
  const heroes = [
    { kind: 'champion' as const, level: 1, items: [{ slug: 'frost-charm', level: 27 }] },
  ];
  expect(heroProjectileNames(heroes)).not.toContain(
    FROST_FLAKE_PRESENTATION.ProjectileOnActivation,
  );
  expect(heroProjectileNames(heroes, { frostFlake: true })).toContain(
    FROST_FLAKE_PRESENTATION.ProjectileOnActivation,
  );
});
