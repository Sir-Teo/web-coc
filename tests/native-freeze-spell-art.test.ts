import { expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import source from '../reference/freeze-spell/effects.json';
import manifest from '../reference/full-client/manifest.json';
import type { Battle } from '../src/game/model';
import type { NativeArtPack } from '../src/game/native-art-pack';
import { nativeEffectDuration, nativeEffectPoses } from '../src/game/native-effects';
import { FREEZE_SPELL_EFFECTS, freezeSpellEffectEvents } from '../src/game/freeze-spell-effects';
import { BattleSoundLog, troopSoundCues } from '../src/game/troop-sounds';
import { GameModel } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { nativeFreezeRecording } from './fixtures/native-freeze-spell';
const root = new URL('../', import.meta.url),
  record = source.packs.freeze,
  pack = JSON.parse(readFileSync(new URL('public/' + record.path, root), 'utf8')) as NativeArtPack,
  iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 }),
  duration = (name: string) => nativeEffectDuration(pack, name);
it('original Freeze art reproduces source pins, graph bytes and complete pack size', () => {
  const pins = new Map(manifest.files.map((f) => [f.path, f.sha256]));
  for (const [path, pin] of Object.entries(source.sources)) expect(pins.get(path)).toBe(pin);
  const file = new URL('public/' + record.path, root);
  expect(createHash('sha256').update(readFileSync(file)).digest('hex')).toBe(record.sha256);
  const size = (dir: URL): number =>
    readdirSync(dir).reduce((sum, name) => {
      const p = new URL(name, dir);
      return sum + (statSync(p).isDirectory() ? size(new URL(name + '/', dir)) : statSync(p).size);
    }, 0);
  expect(size(new URL('./', file))).toBe(record.bytes);
  expect(FREEZE_SPELL_EFFECTS).toHaveLength(17);
});
it.each([1, 2, 3, 4, 5, 6, 7, 8])(
  'level %s samples the original bottle, frost/glow and natural retirement',
  (level) => {
    const r = nativeFreezeRecording(level),
      row = source.spellLevels[level - 1];
    const sample = (at: number, reduced = false) => {
      const battle = r.snapshots.find((s) => s.at === at)!.battle as Battle,
        before = JSON.stringify(battle),
        events = freezeSpellEffectEvents(battle, iso, reduced, duration),
        poses = events.flatMap((e) => nativeEffectPoses(pack, e, e.sampleAt, reduced));
      expect(JSON.stringify(battle)).toBe(before);
      return { battle, events, poses };
    };
    expect(sample(r.bottle).poses.some((p) => p.emitter === 'freeze_bottleDrop')).toBe(true);
    const landing = sample(r.landing);
    expect(landing.events.map((e) => [e.effect, e.at])).toEqual([
      [row.DeployEffect, 0.8],
      [row.DeployEffect2, 0.8],
    ]);
    expect(landing.poses.some((p) => p.emitter === `Freeze_glow_blue_lvl${level}`)).toBe(true);
    expect(landing.poses.some((p) => p.emitter === `Freeze_crystal_lvl${level}`)).toBe(true);
    expect(sample(r.frozen).battle.nativeSpells).toEqual([]);
    expect(sample(r.steady).poses.some((p) => p.emitter === `Freeze_glow_blue_lvl${level}`)).toBe(
      true,
    );
    expect(sample(r.fieldAfter).poses).toEqual([]);
    expect(sample(r.steady, true).poses).toEqual([]);
    expect(sample(r.beforeHit).battle.buildingEffects?.[2]?.frozenUntil).toBeUndefined();
    expect(sample(r.frozen).battle.buildingEffects?.[2]?.frozenUntil).toBe(r.duration + 1.5);
  },
);
it('landing art and audio share the tolerant source deadline without admitting future cues', () => {
  const r = nativeFreezeRecording(),
    b = structuredClone(r.snapshots[0].battle) as Battle;
  b.elapsed = 0.8 - 1e-13;
  const event = freezeSpellEffectEvents(b, iso, false, duration).find(
    (e) => e.effect === 'Freeze deploy lvl1',
  )!;
  expect(event.sampleAt).toBe(0.8);
  expect(nativeEffectPoses(pack, event, event.sampleAt, false).length).toBeGreaterThan(0);
  expect(troopSoundCues(b, new BattleSoundLog()).some((c) => c.key === 'spell:1:deploy')).toBe(
    true,
  );
  b.elapsed = 0.79;
  expect(
    freezeSpellEffectEvents(b, iso, false, duration).some((e) => e.effect === 'Freeze deploy lvl1'),
  ).toBe(false);
  expect(troopSoundCues(b, new BattleSoundLog()).some((c) => c.key === 'spell:1:deploy')).toBe(
    false,
  );
});
it.each([1, 8])(
  'level %s portable casts reconstruct exactly through forward and reverse seeks',
  (level) => {
    const r = nativeFreezeRecording(level),
      model = new GameModel();
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      model.seekReplay(snapshot.at);
      while (model.replay!.seeking) model.step(0.05);
      expect(model.battle).toEqual(snapshot.battle);
    }
  },
);
