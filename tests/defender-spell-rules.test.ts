import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { castNativeSpell, stepNativeSpells } from '../src/game/native-spells';
import { defendingHero } from '../src/game/defending-heroes';
import { createGuardian } from '../src/game/native-guardians';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { spawnSkeleton } from '../src/game/defenders';
import { defenderSpellRuleRecording } from './fixtures/defender-spell-rules';
import { replayBattle, validateReplay } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

function arena(legacy = false) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'wall', 10, 10, 10),
    makeBuilding(3, 'goldstorage', 10, 10, 10),
    makeBuilding(4, 'cannon', 10, 10, 10),
  ];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = emptySpells();
  model.state.king = undefined;
  model.startBattle(0, true);
  const battle = model.battle!;
  if (legacy) delete battle.nativeDefenderSpellRules;
  const hero = defendingHero({ kind: 'king', level: 1, x: 10, y: 10 }, 0);
  const guardian = createGuardian(battle, battle.buildings[0], -2)!;
  const garrison = spawnGarrisonDefender(battle, 'dragon', 5, 1, 10, 10, 0);
  const skeleton = spawnSkeleton(battle, makeBuilding(5, 'skeletontrap', 10, 10, 5), 0, 0);
  battle.defenders = [hero, guardian, garrison, skeleton];
  for (const defender of battle.defenders) {
    defender.x = defender.y = 10;
    defender.spawnedAt = 0;
    defender.hp = defender.maxHp = 10_000;
  }
  for (const building of battle.buildings) building.hp = building.maxHp = 10_000;
  const cast = (name: string, level = 1) => castNativeSpell(battle, name, level, 'attack', 10, 10);
  const step = (at: number) => {
    battle.elapsed = at;
    stepNativeSpells({
      battle,
      damageBuilding: (building, amount) => {
        building.hp = Math.max(0, building.hp - amount);
      },
      effect: () => {},
    });
  };
  const pulse = (name: string, level = 1) => {
    const spell = cast(name, level);
    step(spell.firstHit + 0.01);
  };
  return { battle, hero, guardian, garrison, skeleton, cast, step, pulse };
}

it.each([
  ['Electro Titan Aura', 1, 30, 7.5],
  ['Electro Titan Aura', 5, 60, 15],
  ['Electro Boots Aura', 1, 53, 13.25],
  ['Electro Boots Aura', 10, 80, 20],
  ['DragonDukeDashAura', 1, 240, 24],
  ['DragonDukeDashAura', 10, 480, 48],
] as const)(
  '%s level %s applies its native hero damage multiplier',
  (name, level, damage, heroDamage) => {
    const { battle, hero, guardian, garrison, skeleton, pulse } = arena();
    pulse(name, level);
    expect(hero.maxHp - hero.hp).toBe(heroDamage);
    for (const defender of [guardian, garrison, skeleton])
      expect(defender.maxHp - defender.hp).toBe(damage);
    const cannon = battle.buildings.find((building) => building.kind === 'cannon')!;
    expect(cannon.maxHp - cannon.hp).toBe(damage);
  },
);

it('keeps ordinary Lightning damage and stun at full strength for every defender class', () => {
  const { battle, pulse } = arena();
  pulse('Lightning');
  for (const defender of battle.defenders!) {
    expect(defender.maxHp - defender.hp).toBe(150);
    expect(defender.stunnedUntil).toBeGreaterThan(battle.elapsed);
  }
});

it('Root Rider wall damage leaves every defender class and other buildings untouched', () => {
  const { battle, pulse } = arena();
  pulse('TreantWallDamageAura');
  expect(battle.defenders!.every((defender) => defender.hp === defender.maxHp)).toBe(true);
  expect(battle.buildings.find((building) => building.kind === 'wall')!.hp).toBe(6000);
  expect(
    battle.buildings
      .filter((building) => building.kind !== 'wall')
      .every((building) => building.hp === building.maxHp),
  ).toBe(true);
});

it('Driller surfacing stuns buildings without stunning immune defenders', () => {
  const { battle, pulse } = arena();
  pulse('DrillerSurfacing');
  expect(battle.defenseStuns[4]).toBeGreaterThan(battle.elapsed);
  expect(battle.defenders!.every((defender) => defender.stunnedUntil === undefined)).toBe(true);
});

it('overdue direct damage cannot hurt defenders before their scheduled spawn', () => {
  const { battle, cast, step } = arena();
  const spell = cast('Lightning');
  for (const defender of battle.defenders!) defender.spawnedAt = spell.firstHit + 0.1;
  step(spell.firstHit + 0.2);
  expect(battle.defenders!.every((defender) => defender.hp === defender.maxHp)).toBe(true);
});

it('preserves version-69 full aura damage against defending heroes', () => {
  const { hero, pulse } = arena(true);
  pulse('Electro Boots Aura');
  expect(hero.maxHp - hero.hp).toBe(53);
});

it('preserves version-69 Root Rider damage and Driller stuns against defenders', () => {
  const root = arena(true);
  root.pulse('TreantWallDamageAura');
  expect(root.battle.defenders!.every((defender) => defender.maxHp - defender.hp === 4000)).toBe(
    true,
  );
  const drill = arena(true);
  drill.pulse('DrillerSurfacing');
  expect(
    drill.battle.defenders!.every((defender) => defender.stunnedUntil! > drill.battle.elapsed),
  ).toBe(true);
});

it.each([
  ['rootrider', 0, 4000],
  ['electro-boots', 13.25, 53],
] as const)(
  'reconstructs actual %s aura inputs through portable seeks and version 69',
  (kind, damage, legacyDamage) => {
    const { data, snapshots, defenderId, before, hit } = defenderSpellRuleRecording(kind);
    expect(validateReplay(data)).toBe(true);
    expect(replayBattle(data.initial, 70).nativeDefenderSpellRules).toBe(true);
    expect(replayBattle(data.initial, 69).nativeDefenderSpellRules).toBeUndefined();
    const viewer = new GameModel();
    expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
    for (const snapshot of [...snapshots].reverse()) {
      viewer.seekReplay(snapshot.at);
      while (viewer.replay!.seeking) viewer.step(0.05);
      expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
    }
    const health = (at: number) => {
      viewer.seekReplay(at);
      while (viewer.replay!.seeking) viewer.step(0.05);
      return viewer.battle!.defenders!.find((defender) => defender.id === defenderId)!.hp;
    };
    const hp = health(before);
    expect(hp - health(hit)).toBe(damage);
    expect(viewer.openReplay({ ...data, version: 69 })).toBe(true);
    expect(health(before) - health(hit)).toBe(legacyDamage);
  },
);
