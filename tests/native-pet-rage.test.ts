import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { defaultSpellLevels, emptyArmy, emptySpells } from '../src/game/army';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../src/game/replay';
import type { HeroKind } from '../src/game/native-hero-data';
import { activeBoost } from '../src/game/native-boost';
import {
  unitDamageScale,
  unitSpeedBonus,
  unitAttackIntervalScale,
} from '../src/game/native-status';
import { castNativeSpell } from '../src/game/native-spells';
import { nativeUnitStats } from '../src/game/native-units';
import { stepNativeUnit, type NativeTroopContext } from '../src/game/native-troops';
import { nativePetRageRecording } from './fixtures/native-pet-rage';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

function arena(level = 1, version = REPLAY_VERSION, kind: HeroKind = 'king', other = false) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.king = undefined;
  model.state.nextId = 1000;
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
  model.state.army = { ...emptyArmy(), giant: 2 };
  model.state.spells = { ...emptySpells(), recall: 2, revive: 2 };
  model.state.spellLevels = defaultSpellLevels();
  model.startBattle(0, true);
  const recording = (model as unknown as { recording: ReplayData }).recording;
  recording.initial.heroes = [{ kind, level: 1, items: [], pet: { kind: 'yak', level } }];
  if (other) recording.initial.heroes.push({ kind: 'queen', level: 1, items: [] });
  const battle = (model.battle = replayBattle(recording.initial, version));
  expect(model.deployNativeHero(kind, 5, 6.5)).toBe(true);
  const owner = battle.nativeHeroes![0];
  const hero = battle.units.find((u) => u.id === owner.unitId)!;
  const pet = battle.units.find((u) => u.id === owner.petId)!;
  const until = (at: number) => {
    for (let count = 0; battle.elapsed < at - 1e-9; count++) {
      if (count > 1000 || battle.finished) throw Error('Yak checkpoint not reached');
      model.step(0.05);
    }
  };
  const fall = () => {
    owner.abilityUsed = true;
    hero.hp = 0;
    model.step(0.05);
  };
  return { model, battle, owner, hero, pet, until, fall };
}

it.each([1, 10, 15])(
  'uses the source level %s self-rage and expires after eight seconds',
  (level) => {
    const { battle, owner, pet, until, fall } = arena(level);
    expect(unitDamageScale(pet, 0)).toBe(1);
    fall();
    const started = battle.elapsed;
    expect(owner.petHeroDeathUsed).toBe(true);
    expect(unitDamageScale(pet, started)).toBe(1.7);
    expect(unitSpeedBonus(pet, started)).toBe(2);
    expect(unitAttackIntervalScale(pet, started)).toBe(1);
    expect(activeBoost(pet.native!.effects!.boost, started)!.until).toBeCloseTo(started + 8, 12);
    until(started + 7.95);
    expect(unitDamageScale(pet, battle.elapsed)).toBe(1.7);
    until(started + 8);
    expect(unitDamageScale(pet, battle.elapsed)).toBe(1);
    expect(unitSpeedBonus(pet, battle.elapsed)).toBe(0);
  },
);

it.each(['king', 'queen', 'warden', 'champion', 'prince', 'duke'] as const)(
  'responds to its own %s Hero knockout',
  (kind) => {
    const { owner, pet, battle, fall } = arena(1, undefined, kind);
    fall();
    expect(owner.petHeroDeathUsed).toBe(true);
    expect(unitDamageScale(pet, battle.elapsed)).toBe(1.7);
  },
);

it('lets an automatic Hero ability prevent rage by saving its Hero', () => {
  const { model, hero, owner, pet, battle } = arena();
  hero.hp = 0;
  model.step(0.05);
  expect(hero.hp).toBeGreaterThan(0);
  expect(owner.abilityUsed).toBe(true);
  expect(owner.petHeroDeathUsed).toBeUndefined();
  expect(unitDamageScale(pet, battle.elapsed)).toBe(1);
});

it('does not rage when a different Hero falls or share BoostSelf with a coincident ally', () => {
  const { model, owner, hero, pet, battle, fall } = arena(1, undefined, 'king', true);
  expect(model.deployNativeHero('queen', 5, 6.5)).toBe(true);
  const queenOwner = battle.nativeHeroes![1];
  const queen = battle.units.find((u) => u.id === queenOwner.unitId)!;
  queenOwner.abilityUsed = true;
  queen.hp = 0;
  model.step(0.05);
  expect(owner.petHeroDeathUsed).toBeUndefined();
  expect(unitDamageScale(pet, battle.elapsed)).toBe(1);
  model.activeTroop = 'giant';
  expect(model.deploy(hero.x, hero.y)).toBe(true);
  const giant = battle.units.at(-1)!;
  giant.x = pet.x;
  giant.y = pet.y;
  fall();
  expect(unitDamageScale(pet, battle.elapsed)).toBe(1.7);
  expect(unitDamageScale(giant, battle.elapsed)).toBe(1);
  expect(unitSpeedBonus(giant, battle.elapsed)).toBe(0);
});

it.each(['dead', 'ejected', 'recalled'] as const)('does not boost a %s pet', (state) => {
  const { pet, owner, fall } = arena();
  if (state === 'dead') pet.hp = 0;
  if (state === 'ejected') pet.ejected = true;
  if (state === 'recalled') pet.native!.recalled = true;
  fall();
  expect(pet.native!.effects?.boost).toBeUndefined();
  expect(owner.petHeroDeathUsed).toBeUndefined();
});

it('does not rage on Recall and keeps the unspent trigger on redeployment', () => {
  const { model, battle, owner, until } = arena();
  model.activeSpell = 'recall';
  expect(model.castSpell(5, 6.5)).toBe(true);
  until(2);
  expect(owner.unitId).toBeNull();
  expect(owner.petHeroDeathUsed).toBeUndefined();
  expect(model.deployNativeHero('king', 5, 6.5)).toBe(true);
  const hero = battle.units.find((u) => u.id === owner.unitId)!;
  const pet = battle.units.find((u) => u.id === owner.petId)!;
  owner.abilityUsed = true;
  hero.hp = 0;
  model.step(0.05);
  expect(unitDamageScale(pet, battle.elapsed)).toBe(1.7);
});

it('keeps the spent trigger through Revive, Recall and a newly deployed pet body', () => {
  const { model, battle, owner, hero, until, fall } = arena();
  fall();
  model.activeSpell = 'revive';
  expect(model.castSpell(hero.x, hero.y)).toBe(true);
  until(battle.elapsed + 1.6);
  expect(hero.hp).toBeGreaterThan(0);
  model.activeSpell = 'recall';
  expect(model.castSpell(hero.x, hero.y)).toBe(true);
  until(battle.elapsed + 2);
  expect(owner.unitId).toBeNull();
  expect(owner.petHeroDeathUsed).toBe(true);
  expect(model.deployNativeHero('king', 5, 12)).toBe(true);
  const newHero = battle.units.find((u) => u.id === owner.unitId)!;
  const newPet = battle.units.find((u) => u.id === owner.petId)!;
  newHero.hp = 0;
  model.step(0.05);
  expect(unitDamageScale(newPet, battle.elapsed)).toBe(1);
});

it.each([false, true])('never refreshes the spent trigger after Revive, expired=%s', (expired) => {
  const { model, battle, owner, hero, pet, until, fall } = arena();
  fall();
  const untilAt = activeBoost(pet.native!.effects!.boost, battle.elapsed)!.until;
  if (expired) until(untilAt + 0.1);
  model.activeSpell = 'revive';
  expect(model.castSpell(hero.x, hero.y)).toBe(true);
  for (let count = 0; hero.hp <= 0; count++) {
    if (count > 100) throw Error('Yak Hero Revive failed');
    model.step(0.05);
  }
  hero.hp = 0;
  model.step(0.05);
  expect(owner.petHeroDeathUsed).toBe(true);
  expect(pet.native!.effects!.boost!.sources!['master-death:king'].until).toBe(untilAt);
  expect(unitDamageScale(pet, battle.elapsed)).toBe(expired ? 1 : 1.7);
});

it('retains its weaker self-rage after a stronger Rage pulse expires', () => {
  const { model, battle, pet, until, fall } = arena();
  fall();
  const selfUntil = activeBoost(pet.native!.effects!.boost, battle.elapsed)!.until;
  const spell = castNativeSpell(battle, 'Rage', 7, 'attack', pet.x, pet.y, {
    at: battle.elapsed,
    immediate: true,
  });
  until(spell.firstHit);
  expect(unitDamageScale(pet, battle.elapsed)).toBeCloseTo(2.9);
  // Leave the spell area after its first pulse; only that source's short boost expires.
  pet.x = 30;
  until(battle.elapsed + 1.1);
  expect(unitDamageScale(pet, battle.elapsed)).toBe(1.7);
  expect(activeBoost(pet.native!.effects!.boost, battle.elapsed)!.until).toBe(selfUntil);
});

it('retains the historical unboosted behavior through version 96', () => {
  const { battle, owner, pet, fall } = arena(1, 96);
  fall();
  expect(owner.petHeroDeathUsed).toBeUndefined();
  expect(unitDamageScale(pet, battle.elapsed)).toBe(1);
});

it.each([1, 15])('multiplies level %s Wall damage with self-rage exactly once', (level) => {
  const { battle, pet, fall } = arena(level);
  fall();
  const wall = makeBuilding(2, 'wall', 10, 11, 17);
  wall.hp = wall.maxHp = 1e6;
  battle.buildings.push(wall);
  battle.elapsed += 0.2;
  pet.x = 9.5;
  pet.y = 11.5;
  pet.target = wall.id;
  pet.cooldown = 0;
  pet.native!.targetAt = 0;
  const stats = nativeUnitStats('mightyyak', level);
  const ctx: NativeTroopContext = {
    battle,
    buildings: battle.buildings,
    buildingsById: new Map(battle.buildings.map((b) => [b.id, b])),
    passableWalls: new Set(),
    nextId: () => 2000,
    troopLevel: () => 1,
    damageBuilding: (b, amount) => {
      b.hp -= amount;
    },
    effect() {},
  };
  stepNativeUnit(
    ctx,
    pet,
    {
      damage: stats.damage * unitDamageScale(pet, battle.elapsed),
      speed: stats.speed + unitSpeedBonus(pet, battle.elapsed),
    },
    0.05,
  );
  expect(wall.maxHp - wall.hp).toBeCloseTo(stats.damage * 20 * 1.7, 7);
});

it.each([1, 15])(
  'replays level %s Cannon knockouts and boost expiry through portable reverse seeks',
  (level) => {
    const r = nativePetRageRecording(level);
    const model = new GameModel();
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const snapshot of [...r.snapshots].reverse()) {
      model.seekReplay(snapshot.at);
      while (model.replay!.seeking) model.step(0.05);
      expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
    }
  },
);
