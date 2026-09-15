import { describe, expect, it } from 'vitest';
import { GameModel, makeBuilding, EPIC_ITEM_GEMS } from '../src/game/model';
import {
  HERO_KINDS,
  ITEM_NAMES,
  heroDefaultItems,
  heroItems,
  heroLevelCap,
  heroSlots,
  heroUpgradeQuote,
  itemLevelCap,
  itemUpgradeCost,
  itemStats,
  oreCaps,
  petLevelCap,
  petUnlockHouse,
  petUpgradeQuote,
} from '../src/game/native-hero-data';
import { gearFromLegacy } from '../src/game/native-hero-village';
import { validateSave } from '../src/game/save';

function village(townhall: number, hall: number, extra: ReturnType<typeof makeBuilding>[] = []) {
  const m = new GameModel();
  m.state.obstacles = [];
  m.state.buildings = [
    makeBuilding(1, 'townhall', 20, 20, townhall),
    makeBuilding(2, 'herohall', 30, 20, hall),
    ...[3, 4, 5, 6, 7].map((id, i) => makeBuilding(id, 'builder', 2 + i * 3, 2, 1)),
    ...extra,
  ];
  m.state.nextId = 1000;
  m.state.gold = 1e9;
  m.state.elixir = 1e9;
  m.state.dark = 1e8;
  m.state.gems = 1e6;
  m.tick(m.clock);
  return m;
}

describe('complete hero roster in the village', () => {
  it('matches the official Hero Hall unlocks, slots, level caps and first upgrades', () => {
    expect(HERO_KINDS.map((kind) => heroLevelCap(kind, 18, 12))).toEqual([
      110, 110, 95, 85, 55, 25,
    ]);
    expect([1, 2, 3, 4, 5, 6, 7, 12].map(heroSlots)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    expect(heroLevelCap('king', 18, 9)).toBe(90);
    expect(heroLevelCap('warden', 18, 5)).toBe(20);
    expect(heroUpgradeQuote('king', 1)).toEqual({
      level: 2,
      cost: 5000,
      seconds: 7200,
      resource: 'dark',
    });
    expect(heroUpgradeQuote('warden', 1)).toMatchObject({ cost: 1_000_000, resource: 'elixir' });
    expect(heroUpgradeQuote('duke', 25)).toBeNull();
  });

  it('adds each hero when its Hero Hall and Town Hall gates are met and upgrades it with a builder', () => {
    const m = village(11, 5);
    expect(['king', 'queen', 'prince', 'warden'].every((k) => m.heroProgress(k as never))).toBe(
      true,
    );
    expect(m.heroProgress('champion')).toBeUndefined();
    expect(m.heroSlotCount).toBe(3);
    expect(m.heroLineup).toEqual(['king', 'queen', 'prince']);
    expect(m.setHeroLineup(['warden', 'queen'])).toBe(true);
    expect(m.heroLineup).toEqual(['warden', 'queen', 'king']);
    const elixir = m.state.elixir;
    expect(m.upgradeRosterHero('warden')).toBe(true);
    expect(elixir - m.state.elixir).toBe(1_000_000);
    expect(m.busy).toBe(1);
    expect(validateSave(m.state)).toBe(true);
    m.tick(m.state.heroes!.warden!.upgradeEnd! + 1);
    expect(m.heroProgress('warden')!.level).toBe(2);
  });

  it('migrates the original King equipment and gates items by Blacksmith level', () => {
    const legacy = gearFromLegacy({
      levels: { puppet: 4, vial: 2, boots: 3 },
      loadout: ['boots', 'vial'],
    });
    expect(legacy.loadouts.king).toEqual(['earthquake-boots', 'rage-vial']);
    expect(legacy.levels['barbarian-puppet']).toBe(4);
    const others = HERO_KINDS.filter((hero) => hero !== 'king');
    expect(others.map((hero) => legacy.loadouts[hero])).toEqual(others.map(heroDefaultItems));
    expect(ITEM_NAMES).toHaveLength(42);
    expect(HERO_KINDS.map((hero) => heroItems(hero).length)).toEqual([8, 8, 6, 7, 7, 6]);
    expect(itemLevelCap('barbarian-puppet', 1)).toBe(9);
    expect(itemLevelCap('giant-gauntlet', 10)).toBe(27);
    expect(itemUpgradeCost('giant-gauntlet', 8)).toEqual({ shiny: 1800, glowy: 200, starry: 10 });
    expect(oreCaps(10)).toEqual({ shiny: 50000, glowy: 5000, starry: 1000 });
    expect(itemStats('vampstache', 1).passive).toBe(true);
    expect(itemStats('rage-vial', 1).passive).toBe(false);
  });

  it('upgrades and equips items with ore, buys Epics and unlocks Commons by Blacksmith level', () => {
    const m = village(12, 6, [makeBuilding(20, 'blacksmith', 40, 40, 5)]);
    // Blacksmith 5 unlocks Vampstache (3), Rage Gem (4), Healer Puppet and Noble Iron (5).
    const gear = m.gear;
    expect(
      ['vampstache', 'rage-gem', 'healer-puppet', 'noble-iron'].every((s) => gear.levels[s] === 1),
    ).toBe(true);
    expect(gear.levels['healing-tome']).toBeUndefined();
    m.state.ores = { shiny: 120, glowy: 0, starry: 0 };
    expect(m.upgradeItem('vampstache', 1)).toBe(true);
    expect(m.gear.levels.vampstache).toBe(2);
    expect(m.state.ores.shiny).toBe(0);
    expect(m.upgradeItem('vampstache', 2)).toBe(false);
    expect(m.upgradeItem('vampstache', 2, 1000)).toBe(true);
    expect(m.equipItem('king', 'vampstache', 1)).toBe(true);
    expect(m.gear.loadouts.king).toEqual(['barbarian-puppet', 'vampstache']);
    expect(m.equipItem('queen', 'vampstache', 0)).toBe(false);
    const gems = m.state.gems;
    expect(m.buyEpicItem('giant-gauntlet')).toBe(true);
    expect(gems - m.state.gems).toBe(EPIC_ITEM_GEMS);
    expect(m.equipItem('king', 'giant-gauntlet', 0)).toBe(true);
    expect(validateSave(m.state)).toBe(true);
  });

  it('unlocks pets with the Pet House, researches one at a time and assigns one pet per hero', () => {
    const m = village(15, 9, [makeBuilding(20, 'pethouse', 40, 40, 4)]);
    const pets = m.petProgress;
    expect(Object.keys(pets.levels).sort()).toEqual(['lassi', 'owl', 'unicorn', 'yak']);
    expect(petUnlockHouse('crow')).toBe(12);
    expect(petLevelCap('lassi', 4)).toBeGreaterThan(1);
    expect(petUpgradeQuote('lassi', 1)).toEqual({
      level: 2,
      cost: 20000,
      seconds: 86400,
      resource: 'dark',
    });
    expect(m.researchPet('lassi')).toBe(true);
    expect(m.researchPet('owl')).toBe(false);
    expect(m.assignPet('king', 'lassi')).toBe(true);
    expect(m.assignPet('queen', 'lassi')).toBe(true);
    expect(m.petProgress.assigned).toEqual({ queen: 'lassi' });
    expect(validateSave(m.state)).toBe(true);
    m.tick(m.state.pets!.research!.end + 1);
    expect(m.petProgress.levels.lassi).toBe(2);
  });
});
