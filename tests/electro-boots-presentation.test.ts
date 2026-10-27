import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import source from '../reference/electro-boots/effects.json';
import manifest from '../reference/full-client/manifest.json';
import { GameModel, type Battle } from '../src/game/model';
import type { NativeArtPack } from '../src/game/native-art-pack';
import { nativeEffectDuration, nativeEffectPoses } from '../src/game/native-effects';
import { heroAbilityActivation } from '../src/game/hero-ability-feedback';
import { captureElectroBootsActivation } from '../src/game/native-electro-boots';
import { heroAbilities } from '../src/game/native-heroes';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { BattleSoundLog, troopSoundCues } from '../src/game/troop-sounds';
import {
  ELECTRO_BOOTS_SHAKE,
  electroBootsEffectEvents,
  electroBootsShake,
} from '../src/game/electro-boots-effects';
import {
  heroRegenerationBattle,
  heroRegenerationRecallRecording,
} from './fixtures/hero-regeneration';
import { heroAuraRevivalRecording } from './fixtures/hero-aura-revival';

const spec = source.packs['electro-boots'];
const pack: NativeArtPack = JSON.parse(readFileSync('public/' + spec.path, 'utf8'));
const effect = source.profile.ActivationEffect;
const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });
const duration = (name: string) => nativeEffectDuration(pack, name, Infinity);

it('retains pinned original deployment art and the exact 300 ms emitter, cue and 200 ms camera row', () => {
  const pins = new Map(manifest.files.map((entry) => [entry.path, entry.sha256]));
  for (const [path, hash] of Object.entries(source.sources))
    expect(pins.get(path), path).toBe(hash);
  expect(source.abilityLevelCount).toBe(10);
  expect(
    createHash('sha256')
      .update(readFileSync('public/' + spec.path))
      .digest('hex'),
  ).toBe(spec.sha256);
  const folder = dirname('public/' + spec.path);
  const bytes = readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .reduce((sum, entry) => sum + statSync(join(entry.parentPath, entry.name)).size, 0);
  expect(bytes).toBe(spec.bytes);
  expect(pack.effects![effect][0]).toMatchObject({
    ParticleEmitter: 'Deploy',
    AttachToParent: 'FALSE',
    DestroyWhenParentDies: 'FALSE',
    Sound: 'sfx/ability_electro_boots.ogg',
    Volume: '100',
    MinPitch: '100',
    MaxPitch: '100',
    CameraShake: '20',
    CameraShakeTimeMS: '200',
    CameraShakeInReplay: 'FALSE',
  });
  expect(pack.emitters!.Deploy[0]).toMatchObject({
    ParticleCount: '1',
    EmissionTime: '1',
    MinLife: '300',
    MaxLife: '300',
    StartScale: '1',
    EndScale: '120',
    ParticleFadeOutTime: '100',
    ScaleTimeline: 'TRUE',
    ParticleExportName: 'Deploy',
  });
  expect(duration(effect)).toBeCloseTo(0.301, 10);
  expect(ELECTRO_BOOTS_SHAKE).toEqual({ strength: 20, duration: 0.2, replay: false });
});

it('all 27 item levels activate passively once and preserve version 139 combat and random state', () => {
  for (let level = 1; level <= 27; level++) {
    const r = heroRegenerationBattle('electro-boots', level),
      old = heroRegenerationBattle('electro-boots', level, 139);
    const ability = heroAbilities(r.hero).find((a) => a.name === source.ability)!;
    expect(ability.passive).toBe(true);
    expect(r.hero.abilityUsed).toBeFalsy();
    expect(r.battle.nativeElectroBootsActivations).toEqual([
      { id: `electro-boots:${r.unit.id}:0`, sourceId: r.unit.id, at: 0, x: r.unit.x, y: r.unit.y },
    ]);
    for (let step = 0; step < 40; step++) {
      r.model.step(0.05);
      old.model.step(0.05);
    }
    expect(r.battle.nativeElectroBootsActivations).toHaveLength(1);
    const comparable = JSON.parse(JSON.stringify(r.battle));
    delete comparable.nativeElectroBootsPresentation;
    delete comparable.nativeElectroBootsActivations;
    expect(comparable).toEqual(old.battle);
    r.model.activateNativeHeroAbility('champion');
    expect(r.battle.nativeElectroBootsActivations).toHaveLength(1);
    expect(old.battle.nativeElectroBootsActivations).toBeUndefined();
  }
});

it('keeps art stationary after movement or death and independently exposes the original source sound', () => {
  const r = heroRegenerationBattle('electro-boots');
  const event = r.battle.nativeElectroBootsActivations![0];
  r.model.step(0.1);
  const before = JSON.stringify(r.battle);
  const events = electroBootsEffectEvents(r.battle, iso, duration);
  expect(events).toHaveLength(1);
  expect(events[0].ground).toEqual(iso(event.x, event.y));
  expect(nativeEffectPoses(pack, events[0], r.battle.elapsed, false).length).toBeGreaterThan(0);
  expect(nativeEffectPoses(pack, events[0], r.battle.elapsed, true)).toEqual([]);
  expect(
    troopSoundCues(r.battle, new BattleSoundLog()).filter((c) => c.key.startsWith(event.id)),
  ).toEqual([
    expect.objectContaining({
      key: `${event.id}:sound`,
      at: 0,
      volume: 1,
      pitch: 1,
      sample: 'troop-ability_electro_boots.ogg',
    }),
  ]);
  expect(heroAbilityActivation(r.battle, event.id)).toEqual({
    effect,
    key: `${event.id}:sound`,
    at: 0,
  });
  expect(JSON.stringify(r.battle)).toBe(before);
  r.unit.x += 10;
  r.unit.hp = 0;
  expect(electroBootsEffectEvents(r.battle, iso, duration)).toEqual(events);
  r.battle.elapsed = 0.35;
  expect(electroBootsEffectEvents(r.battle, iso, duration)).toEqual([]);
});

for (const revival of ['revive', 'phoenix'] as const)
  it(`captures real ${revival} at its canonical resurrection point, with one cue and exact portable seeks`, () => {
    const r = heroAuraRevivalRecording('electro-boots', revival);
    const restored = r.snapshots.find((s) => s.at === r.restored)!.battle as Battle;
    expect(
      (r.snapshots.find((s) => s.at === r.dead)!.battle as Battle).nativeElectroBootsActivations,
    ).toHaveLength(1);
    const events = restored.nativeElectroBootsActivations!;
    expect(events).toHaveLength(2);
    const dead = (r.snapshots.find((s) => s.at === r.dead)!.battle as Battle).units.find(
      (u) => u.id === r.unitId,
    )!;
    expect(events[1]).toMatchObject({
      sourceId: r.unitId,
      at: r.resurrectAt,
      x: dead.x,
      y: dead.y,
    });
    const body = restored.units.find((u) => u.id === r.unitId)!;
    const before = JSON.stringify(restored);
    expect(captureElectroBootsActivation(restored, { ...body, x: 999 }, r.resurrectAt)).toBe(
      events[1].id,
    );
    expect(JSON.stringify(restored)).toBe(before);
    expect(
      troopSoundCues(restored, new BattleSoundLog()).filter(
        (c) => c.key === `${events[1].id}:sound`,
      ),
    ).toHaveLength(1);
    const model = new GameModel();
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      model.seekReplay(s.at);
      while (model.replay!.seeking) model.step(0.05);
      expect(JSON.parse(JSON.stringify(model.battle))).toEqual(s.battle);
    }
  });

it('captures real Recall redeployment with a new activation and never replays the old origin', () => {
  const r = heroRegenerationRecallRecording('electro-boots');
  const model = new GameModel();
  expect(model.openReplay(r.data)).toBe(true);
  model.seekReplay(r.afterDeploy);
  while (model.replay!.seeking) model.step(0.05);
  const b = model.battle!,
    events = b.nativeElectroBootsActivations!;
  expect(events).toHaveLength(2);
  expect(events[1]).toMatchObject({ sourceId: r.unitId, at: r.spawnedAt, x: 5, y: 28 });
  expect(events[1].id).not.toBe(events[0].id);
  expect(electroBootsEffectEvents(b, iso, duration).map((e) => e.at)).toEqual([r.spawnedAt]);
});

it('freezes a smooth bounded live camera impulse with pause and suppresses replay/reduced motion without mutation', () => {
  const r = heroRegenerationBattle('electro-boots');
  r.model.step(0.1);
  const before = JSON.stringify(r.battle),
    rest = { x: 0, y: 0 };
  expect(electroBootsShake(r.battle, false)).not.toEqual(rest);
  for (let ms = 1; ms < 200; ms++) {
    const age = ms / 1000,
      offset = electroBootsShake(r.battle, false, false, age);
    expect(Math.abs(offset.x)).toBeLessThanOrEqual(6.4 * (1 - age / 0.2) + 1e-9);
    expect(Math.abs(offset.y)).toBeLessThanOrEqual(6.4 * (1 - age / 0.2) + 1e-9);
    expect(electroBootsShake(JSON.parse(before), false, false, age)).toEqual(offset);
  }
  for (const at of [0, 0.2, 0.3])
    expect(electroBootsShake(r.battle, false, false, at)).toEqual(rest);
  expect(electroBootsShake(r.battle, true)).toEqual(rest);
  expect(electroBootsShake(r.battle, false, true)).toEqual(rest);
  expect(electroBootsShake({ ...r.battle, started: false }, false)).toEqual(rest);
  expect(
    electroBootsShake({ ...r.battle, nativeElectroBootsPresentation: undefined }, false),
  ).toEqual(rest);
  expect(electroBootsShake(null, false)).toEqual(rest);
  expect(JSON.stringify(r.battle)).toBe(before);
});
