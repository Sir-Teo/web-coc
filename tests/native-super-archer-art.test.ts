import { expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import source from '../reference/super-archer/effects.json';
import manifest from '../reference/full-client/manifest.json';
import { nativeEffectDuration, nativeEffectPoses } from '../src/game/native-effects';
import {
  nativePiercingFlight,
  nativeProjectilePoses,
  type NativeProjectilePack,
} from '../src/game/native-projectile-poses';
import type { NativeArtPack } from '../src/game/native-art-pack';
import type { Battle } from '../src/game/model';
import { superArcherEffectEvents } from '../src/game/super-archer-effects';
import {
  BattleSoundLog,
  troopSoundCues,
  troopSoundEffect,
  effectCue,
} from '../src/game/troop-sounds';
import { nativeSuperArcherRecording } from './fixtures/native-super-archer';
const root = new URL('../', import.meta.url),
  iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });
const packs = Object.fromEntries(
  Object.entries(source.packs).map(([id, record]) => [
    id,
    JSON.parse(readFileSync(new URL('public/' + record.path, root), 'utf8')) as NativeArtPack,
  ]),
);
it('original Super Archer cast and silent hit packs match source pins and complete byte counts', () => {
  const pins = new Map(manifest.files.map((f) => [f.path, f.sha256]));
  for (const [path, pin] of Object.entries(source.sources)) expect(pins.get(path)).toBe(pin);
  for (const record of Object.values(source.packs)) {
    const file = new URL('public/' + record.path, root),
      data = readFileSync(file);
    expect(createHash('sha256').update(data).digest('hex')).toBe(record.sha256);
    const size = (dir: URL): number =>
      readdirSync(dir).reduce((sum, name) => {
        const p = new URL(name, dir);
        return (
          sum + (statSync(p).isDirectory() ? size(new URL(name + '/', dir)) : statSync(p).size)
        );
      }, 0);
    expect(size(new URL('./', file))).toBe(record.bytes);
  }
});
it('the original arrow keeps its source speed and orientation past the aim point', () => {
  const r = nativeSuperArcherRecording(),
    battle = r.snapshots.find((s) => s.at === r.passedPrimary)!.battle as Battle,
    shot = battle.nativeArcherShots![0],
    pack = JSON.parse(
      readFileSync(
        new URL('public/assets/projectiles-native/magic-archer-projectile/graph.json', root),
        'utf8',
      ),
    ) as NativeProjectilePack,
    row = pack.projectiles[shot.projectile];
  const before = JSON.stringify(battle),
    flight = nativePiercingFlight(row, shot, battle.elapsed, iso);
  expect(flight.t * shot.length).toBeGreaterThan(shot.length - 4);
  expect(flight.t).toBeLessThan(1);
  expect(shot.speed).toBe(14);
  expect(row.StartOffset).toBe('25');
  expect(
    nativeProjectilePoses(pack, row, flight, battle.elapsed, shot.launched).poses.length,
  ).toBeGreaterThan(0);
  expect(JSON.stringify(battle)).toBe(before);
});
it('captured hit particles are deterministic and retain ground/air placement without touching combat', () => {
  const r = nativeSuperArcherRecording(10, 'defender'),
    battle = r.snapshots.find((s) => s.at === r.landed)!.battle as Battle;
  const before = JSON.stringify(battle),
    duration = (name: string) =>
      nativeEffectDuration(packs[source.effects[name as keyof typeof source.effects]], name),
    events = superArcherEffectEvents(battle, iso, 46, duration);
  expect(events.some((e) => e.effect === source.character.HitEffect)).toBe(true);
  expect(
    events.flatMap((e) =>
      nativeEffectPoses(
        packs[source.effects[e.effect as keyof typeof source.effects]],
        e,
        battle.elapsed,
        false,
      ),
    ).length,
  ).toBeGreaterThan(0);
  expect(superArcherEffectEvents(battle, iso, 46, duration)).toEqual(events);
  expect(JSON.stringify(battle)).toBe(before);
});
it('the original cast cue survives caster removal and no silent hit invents an audio cue', () => {
  const r = nativeSuperArcherRecording(10),
    battle = r.snapshots.find((s) => s.at === r.after)!.battle as Battle;
  battle.units = [];
  const before = JSON.stringify(battle),
    key = `${r.shotId}:attack`,
    cues = troopSoundCues(battle, new BattleSoundLog()).filter((c) => c.key.startsWith(r.shotId));
  expect(cues).toEqual([
    effectCue(troopSoundEffect('superarcher', 10, 'attack')!, key, r.launched),
  ]);
  expect(troopSoundEffect('superarcher', 10, 'hit')).toBeUndefined();
  expect(JSON.stringify(battle)).toBe(before);
});
