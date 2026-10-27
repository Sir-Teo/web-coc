import { expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import source from '../reference/recall/effects.json';
import manifest from '../reference/full-client/manifest.json';
import type { Battle } from '../src/game/model';
import type { NativeArtPack } from '../src/game/native-art-pack';
import type { NativeScenePose } from '../src/game/native-mesh';
import { recallEffectEvents } from '../src/game/native-recall';
import { nativeEffectDuration, nativeEffectPoses } from '../src/game/native-effects';
import { nativeRecallUnitRecording } from './fixtures/native-recall-unit';
import { BattleSoundLog, troopSoundCues, effectCue } from '../src/game/troop-sounds';
const root = new URL('../', import.meta.url),
  record = source.packs.units,
  pack = JSON.parse(readFileSync(new URL('public/' + record.path, root), 'utf8')) as NativeArtPack,
  iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 }),
  duration = (effect: string) => nativeEffectDuration(pack, effect, Infinity),
  events = (battle: Battle, reduced = false) => recallEffectEvents(battle, reduced, iso, duration),
  leaves = (poses: readonly NativeScenePose[]): number =>
    poses.reduce((n, p) => n + ('group' in p ? leaves(p.group) : 1), 0);
it('Recall transition graphs, textures and source lifetime scales retain pinned records', () => {
  const pins = new Map(manifest.files.map((r) => [r.path, r.sha256]));
  for (const [path, pin] of Object.entries(source.sources)) expect(pins.get(path)).toBe(pin);
  const file = new URL('public/' + record.path, root);
  expect(createHash('sha256').update(readFileSync(file)).digest('hex')).toBe(record.sha256);
  const size = (dir: URL): number =>
    readdirSync(dir).reduce((sum, name) => {
      const p = new URL(name, dir);
      return sum + (statSync(p).isDirectory() ? size(new URL(name + '/', dir)) : statSync(p).size);
    }, 0);
  expect(size(new URL('./', file))).toBe(record.bytes);
  expect(source.phases.redeploy.map((p) => p.timeScale)).toEqual([1.11, 1.11]);
  expect(pack.effects['Recall Disappear'][0]).toMatchObject({
    ExportName: 'recall_unit_wave',
    Scale: '70',
  });
});
it('Recall source waves and reverse circles reconstruct at each captured unit position', () => {
  const r = nativeRecallUnitRecording(),
    at = (t: number) => r.snapshots.find((s) => s.at === t)!.battle as Battle;
  for (const [time, emitters] of [
    [r.wave, ['recall_unit_wave']],
    [
      r.returning,
      ['RecallCircleReverseGround', 'RecallCircleTwirlReverse', 'RecallSpellSparksRedeploy'],
    ],
  ] as const) {
    const battle = at(time),
      before = JSON.stringify(battle),
      actual = events(battle),
      poses = actual.flatMap((e) => nativeEffectPoses(pack, e, e.sampleAt, false));
    for (const name of emitters)
      expect(
        poses.some((p) => p.emitter === name && leaves(p.poses) > 0),
        name,
      ).toBe(true);
    for (const event of actual) {
      const recorded = battle.nativeRecallEvents!.find((r) => event.key.startsWith(r.key + ':'))!;
      expect(event.ground).toEqual(iso(recorded.x, recorded.y));
    }
    expect(events(battle)).toEqual(actual);
    expect(JSON.stringify(battle)).toBe(before);
  }
});
it('Recall time scaling preserves the late reverse-aura tail without changing raw legacy durations', () => {
  const r = nativeRecallUnitRecording(),
    battle = r.snapshots.find((s) => s.at === r.returning)!.battle as Battle,
    event = battle.nativeRecallEvents!.find((e) => e.phase === 'redeploy')!;
  expect(duration('RecallRedeployAuraTop')).toBeCloseTo(5.5, 9);
  const one = events({ ...battle, elapsed: event.at + 1.11 }).find(
    (e) => e.effect === 'RecallRedeployAuraTop',
  )!;
  expect(one.sampleAt - event.at).toBeCloseTo(1, 9);
  expect(events({ ...battle, elapsed: event.at + 5.8 }).map((e) => e.effect)).toEqual([
    'RecallRedeployAuraTop',
  ]);
  expect(events({ ...battle, elapsed: event.at + 6.11 })).toEqual([]);
  expect(events(battle, true)).toEqual([]);
  const legacy = structuredClone(battle);
  delete legacy.nativeRecallPresentation;
  expect(events(legacy)).toEqual([]);
});
it('Recall redeployment adds one source cue per primary body and leaves disappearance silent', () => {
  const r = nativeRecallUnitRecording(),
    battle = r.snapshots.find((s) => s.at === r.returning)!.battle as Battle,
    into = battle.nativeRecallEvents!.find((e) => e.phase === 'redeploy')!,
    cues = troopSoundCues(battle, new BattleSoundLog()).filter((c) => c.key.startsWith('recall:'));
  expect(cues).toEqual([effectCue('RecallRedeployAuraTop', `${into.key}:sound`, into.at)]);
  expect(cues[0]).toMatchObject({ volume: 1, pitch: 1 });
  const legacy = structuredClone(battle);
  delete legacy.nativeRecallPresentation;
  expect(
    troopSoundCues(legacy, new BattleSoundLog()).filter((c) => c.key.startsWith('recall:')),
  ).toEqual([]);
});
