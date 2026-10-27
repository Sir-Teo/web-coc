import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import art from '../reference/fireball/effects.json';
import manifest from '../reference/full-client/manifest.json';
import { GameModel, makeBuilding, type Battle, type FX } from '../src/game/model';
import { heroAbilityActivation } from '../src/game/hero-ability-feedback';
import { heroAbilities } from '../src/game/native-heroes';
import { spawnSkeleton } from '../src/game/defenders';
import { BattleSoundLog, troopSoundCues } from '../src/game/troop-sounds';
import { heroProjectileNames } from '../src/game/hero-projectile-prefetch';
import { nativeRow, num } from '../src/game/native-data';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { fireballProfile, fireballEffectEvents } from '../src/game/fireball-effects';
import { nativeEffectDuration, nativeEffectPoses } from '../src/game/native-effects';
import type { NativeArtPack } from '../src/game/native-art-pack';
import type { NativeScenePose } from '../src/game/native-mesh';
import { fireballBattle, nativeFireballRecording } from './fixtures/native-fireball';
import { replayBattle } from '../src/game/replay';
import { launchWardenFireball } from '../src/game/native-fireball';
import type { NativeTroopContext } from '../src/game/native-troops';

describe('Warden Fireball', () => {
  it('pins every retained source and the complete original effect pack', () => {
    const sources = new Map(manifest.files.map((file) => [file.path, file.sha256]));
    for (const [path, sha] of Object.entries(art.sources))
      expect(sources.get(path), path).toBe(sha);
    for (const pack of Object.values(art.packs)) {
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
  });
  it('enables the new rule only for a recorded Warden carrying Fireball', () => {
    const { data } = fireballBattle();
    expect(replayBattle(data.initial).nativeWardenFireball).toBe(true);
    const setup = structuredClone(data.initial);
    setup.heroes![0].items = [];
    expect(replayBattle(setup).nativeWardenFireball).toBeUndefined();
    expect(replayBattle(data.initial, 129).nativeWardenFireball).toBeUndefined();
  });

  it('hands its real activation event to the original effect and sound without changing battle state', () => {
    const { model, battle, until } = fireballBattle();
    until(0.1);
    const events: FX[] = [];
    model.onEffect = (event) => events.push(event);
    expect(model.activateNativeHeroAbility('warden')).toBe(true);
    const shot = battle.nativeFireballs![0];
    const activation = events.find((event) => event.type === 'trap')!;
    expect(activation).toMatchObject({ abilityCastId: shot.id, at: shot.launched });
    const before = JSON.stringify(battle);
    const source = heroAbilityActivation(battle, activation.abilityCastId);
    const cue = troopSoundCues(battle, new BattleSoundLog()).find((cue) => cue.key === source?.key);
    expect(source).toEqual({
      effect: 'FireballActivationEffect',
      key: `${shot.id}:fireball:sound`,
      at: shot.launched,
    });
    expect(cue).toMatchObject({ key: source!.key, at: source!.at, volume: 1.2 });
    expect(heroAbilityActivation(battle, 'unrelated-trap')).toBeUndefined();
    expect(heroAbilityActivation(battle, undefined)).toBeUndefined();
    expect(JSON.stringify(battle)).toBe(before);
  });

  it('automatically launches once on a lethal Cannon hit and retains posthumous damage', () => {
    const { model, battle, until, wardenId } = fireballBattle();
    const unit = battle.units.find((u) => u.id === wardenId)!;
    unit.x = 15;
    unit.hp = 1;
    for (let steps = 0; !battle.nativeFireballs?.length && steps < 100; steps++) model.step(0.05);
    expect(unit.hp).toBeGreaterThan(0);
    expect(battle.nativeHeroes![0].abilityUsed).toBe(true);
    expect(battle.nativeFireballs).toHaveLength(1);
    const shot = battle.nativeFireballs![0];
    const cannon = battle.buildings.find((b) => b.id === shot.targetId)!,
      hp = cannon.hp;
    until(shot.impact);
    expect(unit.hp).toBeLessThanOrEqual(0);
    expect(cannon.hp).toBe(Math.max(0, hp - shot.damage));
    expect(battle.nativeFireballs).toHaveLength(1);
  });
  it.each(Array.from({ length: 27 }, (_, i) => i + 1))(
    'level %s captures the source damage, radius, projectile tier and 1.5-second flight',
    (level) => {
      const { model, battle, until } = fireballBattle(level);
      const ability = heroAbilities(battle.nativeHeroes![0]).find(
        (a) => a.name === 'GrandWardenFireball',
      )!;
      const cannon = battle.buildings.find((b) => b.id === 2)!;
      const hp = cannon.hp;
      expect(model.activateNativeHeroAbility('warden')).toBe(true);
      const shot = battle.projectiles!.find((p) => p.native?.fireball)!;
      expect(fireballProfile(level)!.ProjectileOnActivation).toBe(shot.native!.name);
      expect(shot).toMatchObject({
        targetId: cannon.id,
        targetBuilding: true,
        x: 21.5,
        y: 11.5,
        damage: num(ability.row, 'Damage'),
        splash: num(ability.row, 'DamageRadius') / 100,
        native: { name: ability.row.ProjectileOnActivation, fireball: { level: ability.level } },
      });
      expect(shot.impact - shot.launched).toBe(1.5);
      expect(nativeRow('projectiles', shot.native!.name).DontTrackTarget).toBe('TRUE');
      expect(model.activateNativeHeroAbility('warden')).toBe(false);
      expect(battle.nativeFireballs).toHaveLength(1);
      until(1.45);
      expect(cannon.hp).toBe(hp);
      until(1.5);
      expect(cannon.hp).toBe(Math.max(0, hp - shot.damage));
      expect(battle.projectiles?.some((p) => p.native?.fireball)).toBe(false);
      expect(battle.nativeFireballs![0]).toMatchObject({ x: 21.5, y: 11.5, impact: 1.5 });
    },
  );

  it('keeps the selected point after its target disappears, without redirecting or double-hitting', () => {
    const { model, battle, until } = fireballBattle();
    model.activateNativeHeroAbility('warden');
    const shot = battle.projectiles![0];
    const storage = battle.buildings.find((b) => b.id === 3)!,
      hp = storage.hp;
    battle.buildings.find((b) => b.id === 2)!.hp = 0;
    until(1.5);
    expect(shot).toMatchObject({ x: 21.5, y: 11.5 });
    expect(storage.hp).toBe(hp - shot.damage);
    until(1.6);
    expect(storage.hp).toBe(hp - shot.damage);
  });

  it('falls back to a visible ordinary building, and to its own origin with no target', () => {
    for (const noTargets of [false, true]) {
      const { model, battle, wardenId } = fireballBattle();
      const unit = battle.units.find((u) => u.id === wardenId)!;
      for (const b of battle.buildings)
        if (noTargets || b.kind === 'cannon' || b.kind === 'townhall')
          (battle.buildingEffects ??= {})[b.id] = { invisibleUntil: 10 };
      model.activateNativeHeroAbility('warden');
      const shot = battle.nativeFireballs![0];
      expect(shot.targetId).toBe(noTargets ? 0 : 4);
      expect({ x: shot.x, y: shot.y }).toEqual(
        noTargets ? { x: unit.x, y: unit.y } : { x: 11.5, y: 11.5 },
      );
    }
  });

  it('respects source invisibility and Overgrowth when selecting a defense', () => {
    const { model, battle } = fireballBattle();
    battle.buildings.push(makeBuilding(7, 'cannon', 30, 20, 21));
    battle.buildingEffects = { 2: { overgrownUntil: 10 } };
    model.activateNativeHeroAbility('warden');
    expect(battle.nativeFireballs![0].targetId).toBe(7);
  });

  it.each(['ground', 'air'] as const)(
    'can fall back to a visible %s defender without tracking its later movement',
    (mode) => {
      const { model, battle, wardenId } = fireballBattle();
      const unit = battle.units.find((u) => u.id === wardenId)!;
      battle.buildingEffects = Object.fromEntries(
        battle.buildings.map((b) => [b.id, { invisibleUntil: 10 }]),
      );
      const source = makeBuilding(30, 'skeletontrap', 9, 11, 1);
      source.skeletonMode = mode;
      const target = spawnSkeleton(battle, source, 0, 0);
      target.stunnedUntil = 10;
      const hidden = spawnSkeleton(battle, source, 0, 1);
      hidden.x = unit.x;
      hidden.y = unit.y;
      hidden.invisibleUntil = 10;
      model.activateNativeHeroAbility('warden');
      const shot = battle.projectiles!.find((p) => p.native?.fireball)!;
      expect(shot).toMatchObject({
        targetId: target.id,
        targetDefender: true,
        targetBuilding: false,
        x: target.x,
        y: target.y,
        toAir: mode === 'air',
      });
      const point = { x: shot.x, y: shot.y };
      target.x += 2;
      model.step(0.05);
      expect({ x: shot.x, y: shot.y }).toEqual(point);
    },
  );

  it('respects historical campaign Spell Tower concealment when choosing a fallback defender', () => {
    const { battle, wardenId } = fireballBattle();
    const unit = battle.units.find((u) => u.id === wardenId)!;
    battle.buildingEffects = Object.fromEntries(
      battle.buildings.map((b) => [b.id, { invisibleUntil: 10 }]),
    );
    const source = makeBuilding(30, 'skeletontrap', 7, 11, 1);
    const hidden = spawnSkeleton(battle, source, 0, 0);
    const visible = spawnSkeleton(battle, source, 0, 1);
    hidden.x = 7;
    visible.x = 9;
    battle.late = { spellTower: { defenderHidden: { [hidden.id]: 10 } } } as Battle['late'];
    const ability = heroAbilities(battle.nativeHeroes![0]).find(
      (a) => a.name === 'GrandWardenFireball',
    )!;
    const ctx: NativeTroopContext = {
      battle,
      buildings: battle.buildings,
      buildingsById: new Map(battle.buildings.map((b) => [b.id, b])),
      passableWalls: new Set(),
      nextId: () => 1000,
      troopLevel: () => 1,
      damageBuilding: () => {},
      effect: () => {},
    };
    launchWardenFireball(ctx, unit, ability, 0);
    expect(battle.nativeFireballs![0].targetId).toBe(visible.id);
  });

  it('hits both defender layers at the radius boundary, walls and buildings, while skipping traps and later births', () => {
    const { model, battle, until, wardenId } = fireballBattle();
    const unit = battle.units.find((u) => u.id === wardenId)!;
    (unit.native!.effects ??= {}).boost = { until: 100, damage: 10, speed: 0, attackSpeed: 0 };
    model.activateNativeHeroAbility('warden');
    const shot = battle.nativeFireballs![0];
    expect(shot.damage).toBe(1500);
    until(1.45);
    const defenders = [
      { mode: 'ground' as const, offset: 4, born: 0 },
      { mode: 'air' as const, offset: 4, born: 0 },
      { mode: 'ground' as const, offset: 4.001, born: 0 },
      { mode: 'air' as const, offset: 0, born: shot.impact + 0.01 },
    ].map(({ mode, offset, born }, index) => {
      const source = makeBuilding(20 + index, 'skeletontrap', 0, 0, 1);
      source.skeletonMode = mode;
      const d = spawnSkeleton(battle, source, born, 0);
      Object.assign(d, {
        x: shot.x + offset,
        y: shot.y,
        hp: 10000,
        maxHp: 10000,
        stunnedUntil: 100,
      });
      return d;
    });
    const wall = battle.buildings.find((b) => b.id === 5)!,
      wallHp = wall.hp;
    const trap = battle.buildings.find((b) => b.id === 6)!,
      trapHp = trap.hp;
    const storage = battle.buildings.find((b) => b.id === 3)!,
      storageHp = storage.hp;
    unit.hp = 0;
    unit.spent = true;
    until(shot.impact);
    expect(defenders.map((d) => d.hp)).toEqual([8500, 8500, 10000, 10000]);
    expect(wall.hp).toBe(Math.max(0, wallHp - 1500));
    expect(trap.hp).toBe(trapHp);
    expect(storage.hp).toBe(storageHp - 1500);
  });

  it('leaves Overgrowth-immune buildings intact while area damage still reaches invisible buildings', () => {
    const { model, battle, until } = fireballBattle();
    model.activateNativeHeroAbility('warden');
    const cannon = battle.buildings.find((b) => b.id === 2)!,
      cannonHp = cannon.hp;
    const storage = battle.buildings.find((b) => b.id === 3)!,
      storageHp = storage.hp;
    battle.buildingEffects = { 2: { overgrownUntil: 10 }, 3: { invisibleUntil: 10 } };
    until(1.5);
    expect(cannon.hp).toBe(cannonHp);
    expect(storage.hp).toBe(storageHp - 1500);
  });

  it('keeps its already launched damage after a recorded Recall and reconstructs its source cue', () => {
    const r = nativeFireballRecording(1, undefined, true);
    const beforeHit = r.snapshots.find((s) => s.at === r.beforeHit)!.battle as Battle;
    expect(beforeHit.units.some((u) => u.id === r.wardenId)).toBe(false);
    expect(beforeHit.nativeHeroes![0].recalledHp).toBeGreaterThan(0);
    const impact = r.snapshots.find((s) => s.at === r.impact)!.battle as Battle;
    expect(impact.buildings.find((b) => b.id === 2)!.hp).toBe(750);
    const launch = r.snapshots[0].battle as Battle;
    const cues = troopSoundCues(launch, new BattleSoundLog()).filter((c) =>
      c.key.endsWith(':fireball:sound'),
    );
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ at: r.launched, volume: 1.2 });
    expect(cues[0].pitch).toBeGreaterThanOrEqual(0.7);
    expect(cues[0].pitch).toBeLessThanOrEqual(0.8);
    expect(
      troopSoundCues(launch, new BattleSoundLog()).filter((c) => c.key.endsWith(':fireball:sound')),
    ).toEqual(cues);
  });

  it.each([1, 9, 24])('prefetches the level %s Fireball only with its new controller', (level) => {
    const heroes = [{ kind: 'warden' as const, level: 40, items: [{ slug: 'fireball', level }] }];
    const name = fireballProfile(level)!.ProjectileOnActivation;
    expect(heroProjectileNames(heroes)).not.toContain(name);
    expect(heroProjectileNames(heroes, { wardenFireball: true })).toContain(name);
  });

  it.each([1, 9, 24])(
    'level %s keeps original explosion geometry through cold portable seeks',
    (level) => {
      const r = nativeFireballRecording(level);
      const imported = parseReplayFile(JSON.stringify(makeReplayFile(r.data)));
      const model = new GameModel();
      expect(model.openReplay(imported)).toBe(true);
      for (const s of [...r.snapshots].reverse()) {
        model.seekReplay(s.at);
        while (model.replay!.seeking) model.step(0.05);
        expect(JSON.parse(JSON.stringify(model.battle))).toEqual(s.battle);
      }
      const source = JSON.parse(
        readFileSync('public/assets/fireball-native/effects/graph.json', 'utf8'),
      ) as NativeArtPack;
      const battle = r.snapshots.find((s) => s.at === r.explosion)!.battle as Battle;
      const before = JSON.stringify(battle);
      const events = fireballEffectEvents(
        battle,
        (x, y) => ({ x: (x - y) * 32, y: (x + y) * 16 }),
        46,
        (name) => nativeEffectDuration(source, name, Infinity),
      );
      expect(events.map((e) => e.effect)).toContain(fireballProfile(level)!.HitEffect);
      const leaves = (poses: NativeScenePose[]): number =>
        poses.reduce((n, p) => n + ('group' in p ? leaves(p.group) : 1), 0);
      const poses = events.flatMap((e) => nativeEffectPoses(source, e, battle.elapsed, false));
      expect(poses.reduce((n, p) => n + leaves(p.poses), 0)).toBeGreaterThan(0);
      expect(events.flatMap((e) => nativeEffectPoses(source, e, battle.elapsed, true))).toEqual([]);
      expect(JSON.stringify(battle)).toBe(before);
    },
  );

  it('retains version 129 without the new packet, journal or damage', () => {
    const { model, battle, until } = fireballBattle(27, 129);
    const cannon = battle.buildings.find((b) => b.id === 2)!,
      hp = cannon.hp;
    const events: FX[] = [];
    model.onEffect = (event) => events.push(event);
    model.activateNativeHeroAbility('warden');
    expect(events.find((event) => event.type === 'trap')?.abilityCastId).toBeUndefined();
    until(1.5);
    expect(battle.nativeWardenFireball).toBeUndefined();
    expect(battle.nativeFireballs).toBeUndefined();
    expect(battle.projectiles?.some((p) => p.native?.fireball)).toBeFalsy();
    expect(cannon.hp).toBe(hp);
  });
});
