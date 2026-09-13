import { describe, it, expect } from 'vitest';
import { GameModel, initialSave, makeBuilding } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import {
  BUILDINGS,
  maxCountFor,
  maxLevelFor,
  storageCapacity,
  upgradeCost,
  trapDamage,
  type BuildingKind,
} from '../src/game/data';
import { heroUpgradeCost, heroRecovery, HERO_ABILITY } from '../src/game/heroes';
import { requiredTownHall } from '../src/game/progression';
import { migrateSave, validateSave } from '../src/game/save';
import { stepTraps } from '../src/game/traps';

function village(th = 7) {
  const m = new GameModel();
  m.state.obstacles = [];
  m.townhall!.level = th;
  m.state.buildings.push(makeBuilding(m.state.nextId++, 'herohall', 1, 1));
  m.tick(m.clock);
  return m;
}
function battle(th = 7) {
  const m = village(th);
  m.state.army = emptyArmy();
  m.state.spells = emptySpells();
  m.startBattle(0, true);
  m.battle!.buildings = [makeBuilding(9999, 'townhall', 20, 20)];
  return m;
}

describe('hero progression', () => {
  it('unlocks only after a Hero Hall finishes at Town Hall 4', () => {
    const m = new GameModel();
    m.state.obstacles = []; // Cleared ground for this placement scenario.
    m.beginBuild('herohall');
    expect(m.placement).toBeNull();
    m.townhall!.level = 4;
    m.beginBuild('herohall');
    expect(m.place(2, 26)).toBe(true);
    expect(m.heroReady).toBe(false);
    const hall = m.state.buildings.at(-1)!;
    m.tick(hall.upgradeEnd! + 1);
    expect(m.state.king).toEqual({ level: 1 });
    expect(m.heroReady).toBe(true);
    expect(m.upgradeHero()).toBe(false);
    expect(m.heroMaxLevel).toBe(1);
    expect(validateSave(m.state)).toBe(true);
  });

  it('charges dark elixir once, occupies a builder, and completes a saved upgrade once', () => {
    const m = village();
    m.state.dark = 5000;
    expect(m.upgradeHero()).toBe(true);
    expect(m.state.dark).toBe(5000 - heroUpgradeCost(1));
    expect(m.busy).toBe(1);
    expect(m.heroReady).toBe(false);
    expect(m.upgradeHero()).toBe(false);
    expect(validateSave(m.state)).toBe(true);
    const restored = new GameModel(structuredClone(m.state));
    restored.tick(restored.state.king!.upgradeEnd! + 1000);
    restored.tick(restored.clock + 1000);
    expect(restored.state.king).toEqual({ level: 2 });
    expect(restored.busy).toBe(0);
    expect(restored.heroReady).toBe(true);
    expect(restored.state.dark).toBe(m.state.dark);
  });

  it('requires dark elixir and a builder and enforces both Town Hall and Hero Hall caps', () => {
    const m = village();
    expect(m.upgradeHero()).toBe(false);
    m.state.dark = 40000;
    for (const b of m.state.buildings.filter((b) => b.kind === 'cannon'))
      b.upgradeEnd = m.clock + 10000;
    expect(m.upgradeHero()).toBe(false);
    for (const b of m.state.buildings) delete b.upgradeEnd;
    m.state.king!.level = 10;
    expect(m.upgradeHero()).toBe(false);
    m.townhall!.level = 8;
    expect(m.upgradeHero()).toBe(false);
    m.heroHall!.level = 2;
    expect(m.upgradeHero()).toBe(true);
    const gems = m.state.gems;
    expect(m.finishHero()).toBe(true);
    expect(m.state.gems).toBeLessThan(gems);
    expect(m.state.king!.level).toBe(11);
    expect(m.finishHero()).toBe(false);
  });

  it('produces offline dark elixir, retains overflow in the drill, and stops during construction', () => {
    const m = village();
    const drill = makeBuilding(m.state.nextId++, 'darkdrill', 1, 5);
    m.state.buildings.push(drill);
    m.tick(m.clock + 3600000);
    expect(drill.stored).toBeCloseTo(20);
    m.collect(drill.id);
    expect(m.state.dark).toBe(0);
    const storage = makeBuilding(m.state.nextId++, 'darkstorage', 1, 9);
    m.state.buildings.push(storage);
    m.state.dark = 9990;
    m.collect(drill.id);
    expect(m.state.dark).toBe(10000);
    expect(drill.stored).toBeCloseTo(10);
    drill.upgradeEnd = m.clock + 3600000;
    m.tick(m.clock + 1800000);
    expect(drill.stored).toBeCloseTo(10);
    m.tick(drill.upgradeEnd + 3600000);
    expect(drill.stored).toBeCloseTo(40);
  });

  it('preserves old villages and rejects malformed hero state', () => {
    const legacy = initialSave();
    (legacy as unknown as { version: number }).version = 2;
    const before = structuredClone(legacy);
    delete (legacy as Partial<typeof legacy>).dark;
    const migrated = migrateSave(legacy) as typeof legacy;
    expect(migrated.dark).toBe(0);
    expect(migrated.buildings).toEqual(before.buildings);
    expect(migrated.army).toEqual(before.army);
    expect(validateSave(migrated)).toBe(true);
    const s = village().state;
    for (const king of [
      { level: 21 },
      { level: 0 },
      { level: 1, upgradeStart: 10 },
      { level: 1, upgradeStart: 20, upgradeEnd: 10 },
    ]) {
      expect(validateSave({ ...s, king })).toBe(false);
    }
    expect(validateSave({ ...s, dark: -1 })).toBe(false);
    expect(
      validateSave({ ...s, buildings: s.buildings.filter((b) => b.kind !== 'herohall') }),
    ).toBe(false);
  });
});

describe('hero combat', () => {
  it('supports a hero-only attack, respects deployment boundaries, and cannot deploy twice', () => {
    const m = battle();
    m.step(1);
    expect(m.battle!.finished).toBe(false);
    expect(m.deployHero(21, 21)).toBe(false);
    m.activeHero = true;
    expect(m.deploy(2, 13)).toBe(true);
    expect(m.battle!.started).toBe(true);
    expect(m.deploy(3, 13)).toBe(false);
    expect(m.battle!.units).toHaveLength(1);
    expect(m.armySize).toBe(0);
    expect(m.battle!.remaining).toEqual(emptyArmy());
  });

  it('heals, summons, and rages once without consuming camp troops', () => {
    const m = battle();
    m.deployHero(2, 13);
    const u = m.battle!.units[0];
    u.hp = u.maxHp / 2;
    expect(m.activateHeroAbility()).toBe(true);
    expect(u.hp).toBeCloseTo(u.maxHp / 2 + heroRecovery(1, 7));
    expect(m.battle!.units.filter((u) => u.summoned)).toHaveLength(HERO_ABILITY.spawnBatch);
    m.step(0.5);
    expect(m.battle!.units.filter((u) => u.summoned)).toHaveLength(HERO_ABILITY.summons);
    expect(m.battle!.hero!.rageUntil).toBe(HERO_ABILITY.duration);
    expect(m.activateHeroAbility()).toBe(false);
    expect(m.state.army).toEqual(emptyArmy());
    m.finishBattle();
    expect(m.state.raidLog!.at(-1)!.hero).toEqual({ level: 1, abilityUsed: true });
    expect(m.state.raidLog!.at(-1)!.deployed).toEqual(emptyArmy());
    expect(validateSave(m.state)).toBe(true);
  });

  it('waits until lethal damage for automatic activation and allows the early King ability', () => {
    const m = battle();
    m.deployHero(2, 13);
    const u = m.battle!.units[0];
    u.hp = u.maxHp * 0.1;
    m.step(0.05);
    expect(m.battle!.hero!.abilityUsed).toBe(false);
    u.hp = -10;
    m.step(0.05);
    expect(m.battle!.hero!.abilityUsed).toBe(true);
    expect(u.hp).toBe(450);
    expect(m.battle!.units).toHaveLength(6);
    m.step(0.5);
    expect(m.battle!.units).toHaveLength(9);
    const early = battle(4);
    early.deployHero(2, 13);
    expect(early.activateHeroAbility()).toBe(true);
    expect(early.battle!.units[0].maxHp).toBeLessThan(u.maxHp);
  });

  it('a spring damages a hero by half without ejecting him', () => {
    const m = battle();
    m.deployHero(2, 13);
    const u = m.battle!.units[0];
    m.battle!.buildings.push(makeBuilding(9998, 'springtrap', 2, 13, 2));
    stepTraps(m.battle!, 0.05, () => {});
    expect(u.hp).toBe(u.maxHp - 125);
    expect(u.ejected).toBeFalsy();
  });

  it('returns a defeated King at full health on the next attack without changing the home hero', () => {
    const m = battle();
    m.deployHero(2, 13);
    m.activateHeroAbility();
    for (const u of m.battle!.units) u.hp = 0;
    m.step(0.05);
    expect(m.battle!.finished).toBe(true);
    expect(m.state.king).toEqual({ level: 1 });
    m.returnHome();
    m.startBattle(0, true);
    expect(m.battle!.hero!.abilityUsed).toBe(false);
    expect(m.deployHero(2, 13)).toBe(true);
    expect(m.battle!.units[0].hp).toBe(m.battle!.units[0].maxHp);
  });
});

describe('Town Hall tables', () => {
  it('reports the real next gate independently for each building', () => {
    expect(requiredTownHall('herohall', 1)).toBe(4);
    expect(requiredTownHall('herohall', 2)).toBe(8);
    expect(requiredTownHall('darkdrill', 1)).toBe(7);
    expect(maxLevelFor('goldmine', 5)).toBe(10);
    expect(maxLevelFor('camp', 5)).toBe(5);
    expect(maxLevelFor('airdefense', 3)).toBe(0);
    expect(requiredTownHall('bomb', 2)).toBe(3);
    expect(requiredTownHall('wizardtower', 7)).toBe(9);
  });

  it('makes every available construction and upgrade affordable within that tier storage', () => {
    for (let th = 1; th <= 8; th++) {
      const capacity =
        100000 + maxCountFor('goldstorage', th) * storageCapacity(maxLevelFor('goldstorage', th));
      for (const kind of Object.keys(BUILDINGS) as BuildingKind[]) {
        if (!maxCountFor(kind, th)) continue;
        expect(BUILDINGS[kind].cost, `${kind} construction at TH${th}`).toBeLessThanOrEqual(
          capacity,
        );
        const cap = kind === 'townhall' ? Math.min(8, th + 1) : maxLevelFor(kind, th);
        for (let level = kind === 'townhall' ? th : 1; level < cap; level++)
          expect(upgradeCost(kind, level), `${kind} ${level + 1} at TH${th}`).toBeLessThanOrEqual(
            capacity,
          );
      }
    }
  });
});
