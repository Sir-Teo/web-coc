import { expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import source from '../reference/overgrowth/effects.json';
import manifest from '../reference/full-client/manifest.json';
import type { Battle } from '../src/game/model';
import type { NativeArtPack } from '../src/game/native-art-pack';
import { nativeEffectDuration, nativeEffectPoses } from '../src/game/native-effects';
import { overgrowthEffectEvents, overgrowthPhases } from '../src/game/overgrowth-effects';
import {
  BattleSoundLog,
  troopSoundCues,
  spellSoundEffect,
  effectCue,
} from '../src/game/troop-sounds';
import { nativeOvergrowthRecording } from './fixtures/native-overgrowth';
const root = new URL('../', import.meta.url),
  packs = Object.fromEntries(
    Object.entries(source.packs).map(([id, record]) => [
      id,
      JSON.parse(readFileSync(new URL('public/' + record.path, root), 'utf8')) as NativeArtPack,
    ]),
  );
const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });
const packFor = (effect: string) => packs[source.effects[effect as keyof typeof source.effects]];
it('all original root packs match source pins, graph bytes and complete file sizes', () => {
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
it.each([2, 3, 4])(
  'the original footprint-%s deployed cycle remains visible long after one source clip',
  (size) => {
    const r = nativeOvergrowthRecording(),
      battle = r.snapshots.find((s) => s.at === r.steady)!.battle as Battle,
      phases = overgrowthPhases(size)!;
    const before = JSON.stringify(battle),
      events = overgrowthEffectEvents(battle, iso, false, (name) =>
        nativeEffectDuration(packFor(name), name),
      ),
      event = events.find((e) => e.effect === phases.deployed.effect)!;
    expect(event).toMatchObject({ sustain: true, until: r.until, active: true });
    expect(phases.start.seconds).toBe(0.6);
    expect(phases.stop.frames).toBe(23);
    const pack = packFor(event.effect),
      poses = nativeEffectPoses(pack, event, battle.elapsed, false);
    expect(poses.some((p) => p.emitter === phases.deployed.export)).toBe(true);
    expect(nativeEffectPoses(pack, event, battle.elapsed, false)).toEqual(poses);
    expect(
      nativeEffectPoses(pack, { ...event, sustain: undefined }, battle.elapsed, false).some(
        (p) => p.emitter === phases.deployed.export,
      ),
    ).toBe(false);
    expect(pack.effects[event.effect][0].Looping).toBe('FALSE');
    expect(JSON.stringify(battle)).toBe(before);
  },
);
it('expiry selects original retract clips, and reduced motion holds only deployed roots', () => {
  const r = nativeOvergrowthRecording(),
    battle = r.snapshots.find((s) => s.at === r.retracting)!.battle as Battle,
    events = overgrowthEffectEvents(battle, iso, false, (name) =>
      nativeEffectDuration(packFor(name), name),
    );
  expect(events.filter((e) => e.effect.includes('_stop_'))).toHaveLength(3);
  expect(events.filter((e) => e.active)).toEqual([]);
  for (const event of events.filter((e) => e.effect.includes('_stop_')))
    expect(
      nativeEffectPoses(packFor(event.effect), event, battle.elapsed, false).length,
    ).toBeGreaterThan(0);
  expect(overgrowthEffectEvents(battle, iso, true)).toEqual([]);
  const active = r.snapshots.find((s) => s.at === r.growing)!.battle as Battle,
    reduced = overgrowthEffectEvents(active, iso, true);
  expect(reduced).toHaveLength(3);
  expect(reduced.every((e) => e.effect.includes('_deployed_'))).toBe(true);
});
it('each original retract sound survives a direct seek with the pinned volume and pitch', () => {
  const r = nativeOvergrowthRecording(5),
    battle = r.snapshots.find((s) => s.at === r.retracting)!.battle as Battle,
    before = JSON.stringify(battle),
    cues = troopSoundCues(battle, new BattleSoundLog()).filter((c) =>
      c.key.startsWith('overgrowth:'),
    );
  expect(cues).toHaveLength(3);
  for (const root of r.roots) {
    const event = `rootStop${root.size}` as 'rootStop2' | 'rootStop3' | 'rootStop4',
      key = `${root.key}:stop`;
    expect(cues.find((c) => c.key === key)).toEqual(
      effectCue(spellSoundEffect('Overgrowth', 1, event)!, key, root.until),
    );
  }
  expect(cues.every((c) => c.volume === 0.8 && c.pitch >= 0.8 && c.pitch <= 1)).toBe(true);
  expect(JSON.stringify(battle)).toBe(before);
});
it('root visuals and retract cues switch on the same tolerant deadline as immunity', () => {
  const r = nativeOvergrowthRecording(),
    battle = r.snapshots.find((s) => s.at === r.retracting)!.battle as Battle;
  battle.elapsed = r.until - 1e-13;
  const events = overgrowthEffectEvents(battle, iso, false, (name) =>
    nativeEffectDuration(packFor(name), name),
  );
  expect(events.filter((e) => e.active)).toEqual([]);
  expect(events.filter((e) => e.effect.includes('_stop_'))).toHaveLength(3);
  for (const event of events.filter((e) => e.effect.includes('_stop_')))
    expect(
      nativeEffectPoses(packFor(event.effect), event, event.sampleAt, false).length,
    ).toBeGreaterThan(0);
  expect(
    troopSoundCues(battle, new BattleSoundLog()).filter((c) => c.key.startsWith('overgrowth:')),
  ).toHaveLength(3);
});
