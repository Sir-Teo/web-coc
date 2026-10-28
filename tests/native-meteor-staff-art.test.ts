import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import source from '../reference/meteor-staff/effects.json';
import manifest from '../reference/full-client/manifest.json';
import type { NativeArtPack } from '../src/game/native-art-pack';
import {
  nativeEffectDuration,
  nativeEffectPoses,
  nativeNestedClipDuration,
} from '../src/game/native-effects';
import { capturedSpellEffectEvents } from '../src/game/native-spell-effects';
import {
  METEOR_STAFF_PROFILES,
  METEOR_STAFF_SPELL,
  METEOR_STAFF_SHAKE,
  meteorStaffShake,
} from '../src/game/meteor-staff-effects';
import { BattleSoundLog, troopSoundCues, spellSoundFiles } from '../src/game/troop-sounds';
import { GameModel, type Battle, type FX } from '../src/game/model';
import { heroAbilityActivation } from '../src/game/hero-ability-feedback';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { meteorStaffBattle } from './fixtures/meteor-staff';
import { nativeMeteorStaffRecording } from './fixtures/native-meteor-staff';

const spec = source.packs['meteor-staff'],
  pack: NativeArtPack = JSON.parse(readFileSync('public/' + spec.path, 'utf8'));
const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });
const duration = (effect: string) => nativeEffectDuration(pack, effect, Infinity);
const events = (battle: Battle, ownerIso = iso) =>
  capturedSpellEffectEvents(
    battle,
    METEOR_STAFF_SPELL,
    METEOR_STAFF_PROFILES,
    iso,
    false,
    duration,
    battle.elapsed,
    46,
    ownerIso,
  );

it('pins every original Meteor Staff graph, texture and spell phase without omitted exports', () => {
  const pins = new Map(manifest.files.map((row) => [row.path, row.sha256]));
  for (const [path, hash] of Object.entries(source.sources))
    expect(pins.get(path), path).toBe(hash);
  expect(source.abilityLevelCount).toBe(10);
  expect(source.spellLevels).toHaveLength(10);
  expect(
    createHash('sha256')
      .update(readFileSync('public/' + spec.path))
      .digest('hex'),
  ).toBe(spec.sha256);
  const folder = dirname('public/' + spec.path),
    bytes = readdirSync(folder, { recursive: true, withFileTypes: true })
      .filter((f) => f.isFile())
      .reduce((n, f) => n + statSync(join(f.parentPath, f.name)).size, 0);
  expect(bytes).toBe(spec.bytes);
  expect((pack as NativeArtPack & { skipped?: unknown }).skipped).toBeUndefined();
  for (const profile of METEOR_STAFF_PROFILES) {
    expect(profile.deploySeconds).toBe(0.8);
    expect(profile.pulseSeconds).toBe(1.1);
  }
  expect(pack.effects!['ps_chr_mp_MeteorStrike_StartAura'][0]).toMatchObject({
    AttachToParent: 'TRUE',
    DetachAfterStart: 'FALSE',
    DestroyWhenParentDies: 'FALSE',
  });
  expect(pack.emitters!.e_mp_MeteorStrike_Meteor[0]).toMatchObject({
    MinLife: '800',
    MaxLife: '800',
    ScaleTimeline: 'TRUE',
  });
  const graph = pack.scenes.vfx_character;
  expect(graph.clips[graph.exports.vfx_chr_mp_MeteorStrike_Projectile].timeline).toHaveLength(24);
  expect(graph.clips[graph.exports.vfx_chr_mp_MeteorStrike_ImpactCrater].timeline).toHaveLength(
    150,
  );
  expect(nativeNestedClipDuration(graph, 'vfx_chr_mp_meteorstrike_Aura')).toBeCloseTo(26 / 24, 10);
  expect(METEOR_STAFF_SHAKE).toEqual({ strength: 70, duration: 1, replay: false });
});

it('all 27 item levels preserve version 141 combat, cooldown and RNG while adding only captured presentation', () => {
  for (let level = 1; level <= 27; level++) {
    const current = meteorStaffBattle(level, 142),
      old = meteorStaffBattle(level, 141),
      fx: FX[] = [];
    current.model.onEffect = (event) => fx.push(event);
    for (const r of [current, old]) {
      r.unit.native!.effects = { frozenUntil: 100 };
      r.until(11.2);
    }
    const comparable = JSON.parse(JSON.stringify(current.battle));
    comparable.nativeSpellArt = comparable.nativeSpellArt.filter(
      (name: string) => name !== METEOR_STAFF_SPELL,
    );
    for (const cast of comparable.nativeSpells ?? []) delete cast.activationOrigin;
    comparable.nativeSpellCastHistory = comparable.nativeSpellCastHistory?.filter(
      (cast: { name: string }) => cast.name !== METEOR_STAFF_SPELL,
    );
    if (!old.battle.nativeSpellCastHistory) delete comparable.nativeSpellCastHistory;
    expect(comparable).toEqual(old.battle);
    const cast = current.battle.nativeSpellCastHistory!.find(
      (cast) => cast.name === METEOR_STAFF_SPELL,
    )!;
    expect(cast.activationOrigin).toEqual({ x: 6.9, y: 11.5, air: true });
    expect(
      fx.some((event) => event.type === 'hit' && event.abilityCastId === `meteor-staff:${cast.id}`),
    ).toBe(true);
  }
});

for (const { level, recall } of [
  { level: 1, recall: false },
  { level: 1, recall: true },
  { level: 27, recall: false },
  { level: 27, recall: true },
])
  it(`original aura, fall and crater reconstruct from complete portable snapshots with Recall=${recall}`, () => {
    const r = nativeMeteorStaffRecording(level, recall),
      at = (time: number) => r.snapshots.find((s) => s.at === time)!.battle as Battle;
    const activation = at(r.activation),
      attached = at(r.attached),
      before = JSON.stringify(attached);
    const firstAura = events(activation).find((event) => event.key.endsWith(':activation'))!;
    expect(nativeEffectPoses(pack, firstAura, firstAura.sampleAt, false).length).toBeGreaterThan(0);
    const packet = attached.nativeSpellCastHistory!.find((cast) => cast.id === r.castId)!;
    const aura = events(attached).find((event) => event.key.endsWith(':activation'))!;
    expect(aura.lift).toBe(46);
    const owner = attached.units.find((unit) => unit.id === r.unitId && !unit.native?.recalled);
    expect(aura.ground).toEqual(
      iso((owner ?? packet.activationOrigin!).x, (owner ?? packet.activationOrigin!).y),
    );
    const shifted = events(attached, (x, y) => ({ x: iso(x, y).x + 10, y: iso(x, y).y + 20 })).find(
      (event) => event.key.endsWith(':activation'),
    )!;
    expect(shifted.ground).toEqual(
      recall ? aura.ground : { x: aura.ground.x + 10, y: aura.ground.y + 20 },
    );
    if (recall) {
      expect(owner).toBeUndefined();
      expect(packet.activationOrigin).not.toEqual(
        activation.nativeSpellCastHistory!.find((cast) => cast.id === r.castId)!.activationOrigin,
      );
    }
    expect(events(at(r.fall)).find((event) => event.key.endsWith(':preDeploy'))!.ground).toEqual(
      iso(packet.x, packet.y),
    );
    const impact = events(at(r.impact));
    expect(impact.some((event) => event.key.endsWith(':deploy'))).toBe(true);
    expect(
      impact.flatMap((event) => nativeEffectPoses(pack, event, event.sampleAt, false)).length,
    ).toBeGreaterThan(0);
    expect(events(at(r.tail)).some((event) => event.key.endsWith(':spawn'))).toBe(true);
    expect(events(at(r.after))).toEqual([]);
    expect(JSON.stringify(attached)).toBe(before);
    const model = new GameModel();
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      model.seekReplay(s.at);
      while (model.replay!.seeking) model.step(0.05);
      expect(JSON.parse(JSON.stringify(model.battle))).toEqual(s.battle);
    }
  });

it('plays exactly the source fall and impact takes at their separate visual phases and retains historical silence', () => {
  const r = nativeMeteorStaffRecording(),
    at = (time: number) => r.snapshots.find((s) => s.at === time)!.battle as Battle;
  expect(spellSoundFiles(METEOR_STAFF_SPELL)).toHaveLength(6);
  for (const [time, event, volume, when] of [
    [r.activation, 'preDeploy', 0.7, r.castAt],
    [r.impact, 'deploy', 1, r.visualImpact],
  ] as const) {
    const b = at(time),
      key = `spell:${r.castId}:${event}`,
      cues = troopSoundCues(b, new BattleSoundLog()).filter((cue) => cue.key === key);
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ at: when, volume });
    expect(cues[0].pitch).toBeGreaterThanOrEqual(0.95);
    expect(cues[0].pitch).toBeLessThanOrEqual(1.05);
  }
  expect(heroAbilityActivation(at(r.activation), `meteor-staff:${r.castId}`)).toEqual({
    effect: source.spellLevels[0].PreDeployEffect,
    visualEffect: source.spellLevels[0].ActivationEffect,
    key: `spell:${r.castId}:preDeploy`,
    at: r.castAt,
  });
  const old = nativeMeteorStaffRecording(1, false, 141),
    b = old.snapshots.find((s) => s.at === old.activation)!.battle as Battle;
  expect(b.nativeSpellArt).not.toContain(METEOR_STAFF_SPELL);
  expect(b.nativeSpellCastHistory!.some((cast) => cast.name === METEOR_STAFF_SPELL)).toBe(false);
  expect(
    troopSoundCues(b, new BattleSoundLog()).some((cue) =>
      cue.key.startsWith(`spell:${old.castId}:`),
    ),
  ).toBe(false);
});

it('starts the live impulse at visual impact, preserves paused state and never invents a cancelled impact', () => {
  const r = nativeMeteorStaffRecording(),
    b = r.snapshots.find((s) => s.at === r.impact)!.battle as Battle,
    before = JSON.stringify(b),
    rest = { x: 0, y: 0 };
  expect(b.elapsed).toBeLessThan(r.firstHit);
  expect(meteorStaffShake(b, false)).not.toEqual(rest);
  for (let ms = 1; ms < 1000; ms += 7) {
    const age = ms / 1000,
      offset = meteorStaffShake(b, false, false, r.visualImpact + age);
    expect(Math.abs(offset.x)).toBeLessThanOrEqual(22.4 * (1 - age) + 1e-9);
    expect(Math.abs(offset.y)).toBeLessThanOrEqual(22.4 * (1 - age) + 1e-9);
  }
  for (const t of [r.visualImpact, r.visualImpact + 1])
    expect(meteorStaffShake(b, false, false, t)).toEqual(rest);
  expect(meteorStaffShake(b, true)).toEqual(rest);
  expect(meteorStaffShake(b, false, true)).toEqual(rest);
  expect(JSON.stringify(b)).toBe(before);
  const cancelled = { ...b, elapsed: r.castAt + 0.4, finished: true };
  expect(meteorStaffShake(cancelled, false, false, r.visualImpact + 0.1)).toEqual(rest);
});
