import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import source from '../reference/dark-orb/effects.json';
import manifest from '../reference/full-client/manifest.json';
import type { NativeArtPack } from '../src/game/native-art-pack';
import { nativeEffectDuration, nativeEffectPoses } from '../src/game/native-effects';
import {
  nativePiercingFlight,
  nativeProjectilePack,
  nativeProjectilePoses,
  type NativeProjectilePack,
} from '../src/game/native-projectile-poses';
import { DARK_ORB_PRESENTATION, darkOrbEffectEvents } from '../src/game/dark-orb-effects';
import { heroAbilityActivation } from '../src/game/hero-ability-feedback';
import { BattleSoundLog, troopSoundCues } from '../src/game/troop-sounds';
import { darkOrbBattle, nativeDarkOrbRecording } from './fixtures/native-dark-orb';
import type { Battle, FX } from '../src/game/model';

const read = <T>(path: string): T => JSON.parse(readFileSync('public/' + path, 'utf8'));
const contact = read<NativeArtPack>(source.packs['dark-orb'].path);
const flightPack = read<NativeProjectilePack>(
  nativeProjectilePack(DARK_ORB_PRESENTATION.ProjectileOnActivation)!,
);
const row = flightPack.projectiles[DARK_ORB_PRESENTATION.ProjectileOnActivation];
const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });

it('pins both complete source packs, including the formerly skipped masked crystal', () => {
  expect(source.abilityLevelCount).toBe(7);
  const pins = new Map(manifest.files.map((file) => [file.path, file.sha256]));
  for (const [path, sha] of Object.entries(source.sources)) expect(pins.get(path), path).toBe(sha);
  for (const pack of Object.values(source.packs)) {
    expect(
      createHash('sha256')
        .update(readFileSync('public/' + pack.path))
        .digest('hex'),
    ).toBe(pack.sha256);
    const folder = dirname('public/' + pack.path);
    const bytes = readdirSync(folder, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .reduce((sum, entry) => sum + statSync(join(entry.parentPath, entry.name)).size, 0);
    expect(bytes).toBe(pack.bytes);
  }
  expect(nativeProjectilePack(DARK_ORB_PRESENTATION.ProjectileOnActivation)).toBe(
    source.packs['dark-orb-flight'].path,
  );
  const graph = flightPack.scenes.characters,
    root = graph.clips[graph.exports[row.ExportName]];
  expect(root.timeline).toHaveLength(30);
  expect(root.fps).toBe(24);
  expect(flightPack.skipped).toBeUndefined();
});

it('plays every retained crystal frame at its source height plus the airborne Prince lift', () => {
  const r = darkOrbBattle();
  r.model.activateNativeHeroAbility('prince');
  const shot = r.battle.nativeDarkOrbs![0];
  for (let frame = 0; frame < 30; frame++) {
    const at = shot.launched + (frame + 0.25) / 24;
    const flight = nativePiercingFlight(row, shot, at, iso, 46);
    const legacy = nativePiercingFlight(row, shot, at, iso);
    expect(flight.height).toBe(98);
    expect(flight.y).toBe(legacy.y - 46);
    expect(flight.ground).toEqual(legacy.ground);
    expect(
      nativeProjectilePoses(flightPack, row, flight, at, shot.launched).poses.length,
    ).toBeGreaterThan(0);
  }
});

it('rebuilds original contact particles from captured hit points after Prince Recall', () => {
  const r = nativeDarkOrbRecording(18, true);
  const battle = r.snapshots.find((snapshot) => snapshot.at === r.contact)!.battle as Battle;
  expect(battle.units.some((unit) => unit.id === r.princeId)).toBe(false);
  const before = JSON.stringify(battle);
  const duration = (name: string) => nativeEffectDuration(contact, name, Infinity);
  const events = darkOrbEffectEvents(battle, iso, 46, duration);
  expect(events.length).toBeGreaterThan(0);
  const hit = battle.nativeDarkOrbs![0].hit.at(-1)!;
  expect(events.find((event) => event.at === hit.at)!.ground).toEqual(iso(hit.x, hit.y));
  expect(
    events.flatMap((event) => nativeEffectPoses(contact, event, battle.elapsed, false)).length,
  ).toBeGreaterThan(0);
  expect(
    events.flatMap((event) => nativeEffectPoses(contact, event, battle.elapsed, true)),
  ).toEqual([]);
  expect(JSON.stringify(battle)).toBe(before);
});

it('hands a real activation to the source portal and one original activation cue', () => {
  const r = darkOrbBattle();
  const events: FX[] = [];
  r.model.onEffect = (fx) => events.push(fx);
  r.model.activateNativeHeroAbility('prince');
  const shot = r.battle.nativeDarkOrbs![0],
    fx = events.find((fx) => fx.type === 'trap')!;
  expect(fx).toMatchObject({ abilityCastId: shot.id, at: shot.launched, text: 'DARK ORB' });
  expect(heroAbilityActivation(r.battle, fx.abilityCastId)).toEqual({
    effect: DARK_ORB_PRESENTATION.ActivationEffect,
    visualEffect: DARK_ORB_PRESENTATION.SpawnEffect,
    key: `${shot.id}:sound`,
    at: shot.launched,
  });
  const cue = troopSoundCues(r.battle, new BattleSoundLog()).filter(
    (cue) => cue.key === `${shot.id}:sound`,
  );
  expect(cue).toHaveLength(1);
  expect(cue[0]).toMatchObject({ at: shot.launched, volume: 0.8 });
  expect(cue[0].pitch).toBeGreaterThanOrEqual(0.9);
  expect(cue[0].pitch).toBeLessThanOrEqual(1);
});
