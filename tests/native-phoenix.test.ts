import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { defaultSpellLevels, emptyArmy, emptySpells } from '../src/game/army';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../src/game/replay';
import { nativeUnitStats } from '../src/game/native-units';
import { healUnit, hurtUnit, unitHidden, unitTriggersTraps } from '../src/game/native-status';
import {
  targetableUnit,
  stepNativeUnit,
  resolveNativeImpact,
  type NativeTroopContext,
} from '../src/game/native-troops';
import { defendingHero } from '../src/game/defending-heroes';
import { launchProjectile } from '../src/game/projectiles';
import type { HeroKind } from '../src/game/native-hero-data';
import { nativePhoenixRecording } from './fixtures/native-phoenix';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { phoenixLifeFraction } from '../src/game/native-status';
import { castNativeSpell } from '../src/game/native-spells';

function arena(level = 1, version = REPLAY_VERSION, kind: HeroKind = 'king') {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
  model.state.nextId = 1000;
  model.state.king = undefined;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), recall: 2, heal: 1 };
  model.state.spellLevels = defaultSpellLevels();
  model.startBattle(0, true);
  const recording = (model as unknown as { recording: ReplayData }).recording;
  recording.version = version;
  recording.initial.heroes = [{ kind, level: 1, items: [], pet: { kind: 'phoenix', level } }];
  model.battle = replayBattle(recording.initial, version);
  expect(model.deployNativeHero(kind, 5, 6.5)).toBe(true);
  const battle = model.battle,
    owner = battle.nativeHeroes![0];
  const hero = battle.units.find((u) => u.id === owner.unitId)!;
  const bird = battle.units.find((u) => u.id === owner.petId)!;
  const egg = battle.units.find((u) => u.id === owner.phoenix?.eggId);
  const until = (at: number) => {
    for (let count = 0; battle.elapsed < at - 1e-9; count++) {
      if (count > 2000 || battle.finished) throw Error('Phoenix checkpoint not reached');
      model.step(0.05);
    }
  };
  const hatch = () => {
    owner.abilityUsed = true;
    hero.hp = 0;
    model.step(0.05);
    const projectile = battle.projectiles!.find((p) => p.native?.phoenixRevive)!;
    expect(projectile).toBeDefined();
    return projectile;
  };
  return { model, battle, recording, owner, hero, bird, egg, until, hatch };
}

it('deploys the source Egg and hides the waiting bird without granting an extra attacker', () => {
  const { battle, hero, bird, egg, owner, model } = arena();
  expect(battle.units).toHaveLength(3);
  expect(owner.phoenix).toEqual({ used: false, eggId: egg!.id });
  expect(egg!.kind).toBe('phoenixegg');
  expect(egg!.maxHp).toBe(nativeUnitStats('phoenixegg', 1).hp);
  expect(unitHidden(egg!, 0) && unitHidden(bird, 0)).toBe(true);
  expect(targetableUnit(battle, egg!)).toBe(false);
  expect(targetableUnit(battle, bird)).toBe(false);
  expect(unitTriggersTraps(egg!)).toBe(false);
  expect(unitTriggersTraps(bird)).toBe(true);
  const hp = [egg!.hp, bird.hp];
  expect(hurtUnit(battle, egg!, 1e6)).toBe(0);
  expect(hurtUnit(battle, bird, 1e6)).toBe(0);
  model.step(0.05);
  expect([egg!.hp, bird.hp]).toEqual(hp);
  expect(egg!.attacking || bird.attacking).toBe(false);
  expect(bird.target).toBeNull();
  expect(hero.hp).toBeGreaterThan(0);
});

it('lets the Egg follow its Hero while the dormant bird stays with the Egg', () => {
  const { model, hero, bird, egg } = arena();
  hero.x = 20;
  const start = egg!.x;
  model.step(0.05);
  expect(egg!.x).toBeGreaterThan(start);
  expect(Math.hypot(egg!.x - start, egg!.y - 6.9)).toBeLessThanOrEqual(0.15 + 1e-9);
  expect({ x: bird.x, y: bird.y }).toEqual({ x: egg!.x, y: egg!.y });
});

it('keeps the waiting pair out of ordinary defense targeting while the source bird can trip an air mine', () => {
  const { model, battle, hero, bird, egg, until } = arena();
  hero.x = hero.y = 30;
  battle.buildings.push(makeBuilding(2, 'seekingairmine', 5, 6, 1));
  const hp = bird.hp;
  model.step(0.05);
  expect(battle.traps[2]?.targetId).toBe(bird.id);
  expect(battle.traps[2]?.targetId).not.toBe(egg!.id);
  until(3);
  expect(bird.hp).toBe(hp);
  expect(egg!.hp).toBe(egg!.maxHp);
});

it('does not let a Cannon select the visible but untargetable Egg', () => {
  const { model, battle, hero, egg } = arena();
  hero.x = hero.y = 30;
  battle.buildings.push(makeBuilding(2, 'cannon', 7, 5, 21));
  model.step(0.05);
  expect(battle.cannons?.[2]?.fired ?? 0).toBe(0);
  expect(egg!.hp).toBe(egg!.maxHp);
});

for (const [level, protectedSeconds] of [
  [1, 6.5],
  [5, 7.5],
  [10, 8.5],
]) {
  it(`uses source level ${level} resurrection flight and shared protection end`, () => {
    const { battle, owner, hero, bird, egg, hatch, until } = arena(level);
    const projectile = hatch(),
      started = battle.elapsed;
    expect(projectile.native!.name).toBe('PhoenixResurrect');
    expect(projectile.impact - projectile.launched).toBeCloseTo(0.5, 12);
    expect(owner.phoenix!.used && owner.phoenix!.pending).toBe(true);
    expect(battle.units.includes(egg!)).toBe(false);
    expect(bird.native!.phoenixWaiting).toBeUndefined();
    expect(bird.native!.effects!.immortalUntil).toBeCloseTo(started + protectedSeconds, 12);
    until(projectile.impact - 0.05);
    expect(hero.hp).toBeLessThanOrEqual(0);
    until(projectile.impact);
    expect(hero.hp).toBe(1);
    expect(hero.spent).toBe(false);
    expect(hero.defeatedAt).toBeUndefined();
    const untilAt = hero.native!.effects!.phoenixRevive!.until;
    expect(untilAt).toBeCloseTo(started + protectedSeconds, 12);
    expect(hero.native!.effects!.phoenixRevive!.duration).toBe(protectedSeconds - 0.5);
    expect(hurtUnit(battle, hero, 1e6)).toBe(0);
    expect(hurtUnit(battle, bird, 1e6)).toBe(0);
    until(untilAt - 0.05);
    expect(hero.hp).toBeGreaterThan(0);
    until(untilAt);
    expect(hero.hp).toBe(0);
    expect(hero.defeatedAt).toBeCloseTo(untilAt, 12);
    expect(bird.hp).toBeGreaterThan(0);
    expect(hurtUnit(battle, bird, 10)).toBe(10);
    expect(owner.phoenix!.used).toBe(true);
    expect(battle.projectiles?.filter((p) => p.native?.phoenixRevive) ?? []).toEqual([]);
  });
}

it.each(['king', 'queen', 'warden', 'champion', 'prince', 'duke'] as const)(
  'revives its assigned %s Hero',
  (kind) => {
    const { hero, hatch, until } = arena(1, undefined, kind);
    const p = hatch();
    until(p.impact);
    expect(hero.hp).toBeGreaterThan(0);
    expect(hero.native!.effects!.phoenixRevive).toBeDefined();
  },
);

it('runs the automatic Hero ability before consuming the Phoenix hatch', () => {
  const { model, owner, hero, bird, battle } = arena();
  hero.hp = 0;
  model.step(0.05);
  expect(owner.abilityUsed).toBe(true);
  expect(hero.hp).toBeGreaterThan(0);
  expect(owner.phoenix!.used).toBe(false);
  expect(bird.native!.phoenixWaiting).toBe(true);
  expect(battle.projectiles?.some((p) => p.native?.phoenixRevive) ?? false).toBe(false);
});

it('does not let a separate Revive Spell replace a pending Phoenix resurrection', () => {
  const { battle, hero, hatch, until } = arena();
  const shot = hatch();
  const cast = castNativeSpell(battle, 'Revive', 1, 'attack', hero.x, hero.y, {
    at: battle.elapsed,
    immediate: true,
  });
  until(cast.firstHit);
  expect(hero.hp).toBeLessThanOrEqual(0);
  until(shot.impact);
  expect(hero.hp).toBe(1);
});

it('allows a later Revive Spell without resetting the used hatch or leaving a healing block', () => {
  const { battle, hero, owner, hatch, until } = arena();
  const shot = hatch();
  until(shot.impact);
  until(hero.native!.effects!.phoenixRevive!.until + 0.1);
  expect(hero.hp).toBe(0);
  const cast = castNativeSpell(battle, 'Revive', 1, 'attack', hero.x, hero.y, {
    at: battle.elapsed,
    immediate: true,
  });
  until(cast.firstHit);
  expect(hero.hp).toBeGreaterThan(0);
  expect(owner.phoenix!.used).toBe(true);
  expect(owner.phoenix!.eggId).toBeNull();
  expect(hurtUnit(battle, hero, 10)).toBe(10);
  expect(healUnit(battle, hero, 10)).toBe(10);
});

it('blocks direct healing, native healing pulses and legacy Healer projectiles during temporary life', () => {
  const { model, battle, owner, hero, hatch, until } = arena();
  const p = hatch();
  until(p.impact);
  expect(healUnit(battle, hero, 9999)).toBe(0);
  launchProjectile(
    battle,
    {
      weapon: 'healing',
      sourceId: 2000,
      targetId: hero.id,
      targetBuilding: false,
      fromX: hero.x,
      fromY: hero.y,
      x: hero.x,
      y: hero.y,
      damage: 9999,
      splash: 1.5,
    },
    () => {},
  );
  model.step(0.05);
  expect(hero.hp).toBe(1);
  model.activeSpell = 'heal';
  expect(model.castSpell(hero.x, hero.y)).toBe(true);
  until(battle.elapsed + 1);
  expect(hero.hp).toBe(1);
  owner.abilityUsed = false;
  expect(model.activateNativeHeroAbility('king')).toBe(true);
  expect(hero.hp).toBe(1);
});

it('recalls and redeploys an unused Egg without consuming its one hatch', () => {
  const { model, battle, owner, hero, egg } = arena();
  model.activeSpell = 'recall';
  expect(model.castSpell(hero.x, hero.y)).toBe(true);
  for (let i = 0; owner.unitId !== null; i++) {
    if (i > 100) throw Error('Phoenix Recall failed');
    model.step(0.05);
  }
  expect(battle.units.includes(egg!)).toBe(false);
  expect(owner.phoenix!.used).toBe(false);
  expect(model.deployNativeHero('king', 5, 12)).toBe(true);
  expect(battle.units.find((u) => u.id === owner.phoenix!.eggId)!.kind).toBe('phoenixegg');
  expect(battle.units.find((u) => u.id === owner.petId)!.native!.phoenixWaiting).toBe(true);
});

it('pauses revival time in Recall and never grants another Egg on redeployment', () => {
  const { model, battle, owner, hero, hatch, until } = arena();
  const p = hatch();
  until(p.impact + 0.3);
  model.activeSpell = 'recall';
  expect(model.castSpell(hero.x, hero.y)).toBe(true);
  for (let i = 0; owner.unitId !== null; i++) {
    if (i > 100) throw Error('Revived Hero Recall failed');
    model.step(0.05);
  }
  const remaining = owner.phoenix!.pausedRevive!;
  expect(remaining).toBeGreaterThan(0);
  until(battle.elapsed + 10);
  expect(owner.phoenix!.pausedRevive).toBe(remaining);
  expect(model.deployNativeHero('king', 5, 12)).toBe(true);
  const revived = battle.units.find((u) => u.id === owner.unitId)!;
  expect(battle.units.some((u) => u.kind === 'phoenixegg')).toBe(false);
  expect(revived.native!.effects!.phoenixRevive!.until).toBeCloseTo(battle.elapsed + remaining, 12);
  expect(revived.native!.effects!.phoenixRevive!.duration).toBe(6);
  expect(phoenixLifeFraction(revived, battle.elapsed)).toBeCloseTo(remaining / 6, 12);
  until(revived.native!.effects!.phoenixRevive!.until);
  expect(revived.hp).toBe(0);
  expect(owner.phoenix!.used).toBe(true);
});

it.each([
  [1, false],
  [10, false],
  [5, true],
] as const)(
  'reconstructs real level %s Phoenix inputs, Recall=%s, through portable backward seeks',
  (level, recall) => {
    const r = nativePhoenixRecording(level, recall);
    const viewer = new GameModel();
    expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const snapshot of [...r.snapshots].reverse()) {
      viewer.seekReplay(snapshot.at);
      while (viewer.replay!.seeking) viewer.step(0.05);
      expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
    }
  },
);

it('preserves version 94 bird deployment and permanent knockout', () => {
  const { model, battle, owner, hero, bird } = arena(1, 94);
  expect(battle.units).toHaveLength(2);
  expect(owner.phoenix).toBeUndefined();
  expect(unitHidden(bird, 0)).toBe(false);
  owner.abilityUsed = true;
  hero.hp = 0;
  model.step(0.05);
  expect(battle.projectiles?.some((p) => p.native?.phoenixRevive) ?? false).toBe(false);
  expect(hero.hp).toBeLessThanOrEqual(0);
});

it.each([false, true])(
  'uses the native Phoenix projectile and a single same-layer splash hit, air=%s',
  (air) => {
    const { battle, hero, bird, hatch, until } = arena();
    const resurrection = hatch();
    until(resurrection.impact);
    const target = defendingHero(
      { kind: air ? 'prince' : 'king', level: air ? 95 : 110, x: 11, y: 10 },
      0,
    );
    const near = defendingHero(
      { kind: air ? 'prince' : 'king', level: air ? 95 : 110, x: 11.1, y: 10 },
      1,
    );
    const ground = defendingHero({ kind: 'king', level: 110, x: 11.1, y: 10 }, 2);
    target.alerted = near.alerted = ground.alerted = true;
    battle.defenders = [target, near, ...(air ? [ground] : [])];
    bird.x = 10;
    bird.y = 10;
    bird.target = null;
    bird.cooldown = 0;
    hero.target = null;
    hero.defenderTarget = target.id;
    const building = makeBuilding(5000, 'goldstorage', 11, 10, 1);
    battle.buildings.push(building);
    const ctx: NativeTroopContext = {
      battle,
      buildings: battle.buildings,
      buildingsById: new Map(battle.buildings.map((b) => [b.id, b])),
      passableWalls: new Set(),
      nextId: () => 3000,
      troopLevel: () => 1,
      effect: () => {},
      damageBuilding: (b, amount) => {
        b.hp -= amount;
      },
    };
    const stats = nativeUnitStats('phoenix', 1);
    stepNativeUnit(ctx, bird, stats, 0.05);
    const shot = battle.projectiles!.find((p) => p.sourceId === bird.id)!;
    expect(shot.native!.name).toBe('PhoenixProjectile');
    expect(shot.impact - shot.launched).toBeCloseTo(0.2, 12);
    expect(shot.toAir).toBe(air);
    near.x = ground.x = shot.x + 0.1;
    near.y = ground.y = shot.y;
    battle.elapsed = shot.impact;
    resolveNativeImpact(ctx, shot);
    expect(target.maxHp - target.hp).toBeCloseTo(stats.damage, 8);
    expect(near.maxHp - near.hp).toBeCloseTo(stats.damage, 8);
    if (air) {
      expect(ground.hp).toBe(ground.maxHp);
      expect(building.hp).toBe(building.maxHp);
    }
  },
);
