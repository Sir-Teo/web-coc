import { it, expect } from 'vitest';
import { DeveloperControls } from '../src/dev/controls';
import { maxVillagePlan, packVillage, plannedTotal } from '../src/dev/village';
import {
  deleteArmyConfig,
  distributeArmy,
  distributeSpells,
  readArmyConfigs,
  singleArmy,
  writeArmyConfig,
} from '../src/dev/loadout';
import { readVillageSlots, writeVillageSlot } from '../src/dev/slots';
import { GameModel } from '../src/game/model';
import { MAX_SAVED_BUILDINGS, validateSave } from '../src/game/save';
import {
  BUILDINGS,
  MAX_TOWNHALL,
  SPELLS,
  SPELL_KEYS,
  TROOPS,
  TROOP_KEYS,
  isTrap,
  maxCountFor,
  maxLevelFor,
} from '../src/game/data';
import { BUILD_MAX, BUILD_MIN } from '../src/game/grid';
import { armySpace, spellSpace } from '../src/game/army';
import { HERO_KINDS, heroSlots } from '../src/game/native-hero-data';

const tiers = Array.from({ length: MAX_TOWNHALL }, (_, index) => index + 1);

it('plans every building a tier permits, at that tier’s ceiling, within the save format', () => {
  for (const townhall of tiers) {
    const plan = maxVillagePlan(townhall);
    expect(plannedTotal(plan)).toBeLessThanOrEqual(MAX_SAVED_BUILDINGS);
    for (const { kind, count, level } of plan) {
      expect(count).toBe(kind === 'townhall' ? 1 : maxCountFor(kind, townhall));
      expect(level).toBe(kind === 'townhall' ? townhall : maxLevelFor(kind, townhall));
    }
    // A tier the catalog withholds entirely is absent rather than listed at zero.
    expect(plan.every((entry) => entry.count > 0 && entry.level > 0)).toBe(true);
  }
});

it('packs every tier inside the buildable area without a single overlap', () => {
  for (const townhall of tiers) {
    const placements = packVillage(maxVillagePlan(townhall));
    expect(placements, `Town Hall ${townhall}`).not.toBeNull();
    const occupied = new Set<string>();
    for (const p of placements!) {
      const size = BUILDINGS[p.kind].size;
      expect(p.x).toBeGreaterThanOrEqual(BUILD_MIN);
      expect(p.y).toBeGreaterThanOrEqual(BUILD_MIN);
      expect(p.x + size).toBeLessThanOrEqual(BUILD_MAX);
      expect(p.y + size).toBeLessThanOrEqual(BUILD_MAX);
      for (let y = p.y; y < p.y + size; y++)
        for (let x = p.x; x < p.x + size; x++) {
          expect(occupied.has(`${x},${y}`), `overlap at ${x},${y} (TH${townhall})`).toBe(false);
          occupied.add(`${x},${y}`);
        }
    }
    // Walls ring the base rather than sitting inside it, and the Town Hall holds the middle.
    const core = placements!.filter((p) => p.kind !== 'wall');
    const left = Math.min(...core.map((p) => p.x));
    const top = Math.min(...core.map((p) => p.y));
    const right = Math.max(...core.map((p) => p.x + BUILDINGS[p.kind].size));
    const bottom = Math.max(...core.map((p) => p.y + BUILDINGS[p.kind].size));
    for (const wall of placements!.filter((p) => p.kind === 'wall'))
      expect(
        wall.x < left || wall.x >= right || wall.y < top || wall.y >= bottom,
        `wall inside the base at ${wall.x},${wall.y} (TH${townhall})`,
      ).toBe(true);
    const hall = placements!.find((p) => p.kind === 'townhall')!;
    const middle = (BUILD_MIN + BUILD_MAX) / 2;
    expect(Math.hypot(hall.x + 2 - middle, hall.y + 2 - middle)).toBeLessThan(3);
  }
});

it('builds a valid maxed village at every Town Hall, with troops in the camps', () => {
  for (const townhall of tiers) {
    const m = new GameModel();
    new DeveloperControls(m).maxTownHall(townhall);
    expect(validateSave(m.state), `Town Hall ${townhall} save`).toBe(true);
    expect(m.townhallLevel).toBe(townhall);
    for (const { kind, count, level } of maxVillagePlan(townhall)) {
      expect(m.countOf(kind), `${kind} count at TH${townhall}`).toBe(count);
      expect(
        m.state.buildings.filter((b) => b.kind === kind).every((b) => b.level === level),
        `${kind} level at TH${townhall}`,
      ).toBe(true);
    }
    expect(m.busy).toBe(0);
    expect(m.armySize).toBeGreaterThan(0);
    expect(m.armySize).toBeLessThanOrEqual(m.capacity);
    expect(m.spellHousing).toBeLessThanOrEqual(m.spellCapacity);
    expect(m.state.gold).toBe(m.resourceCap('gold'));
  }
});

it('maxes heroes, pets, gear and research to the ceilings each Town Hall allows', () => {
  const m = new GameModel();
  const dev = new DeveloperControls(m);
  dev.maxTownHall(MAX_TOWNHALL);
  expect(m.state.king!.level).toBe(m.heroMaxLevel);
  for (const kind of HERO_KINDS)
    expect(m.heroProgress(kind)!.level, kind).toBe(m.heroLevelMax(kind));
  expect(m.heroLineup).toHaveLength(heroSlots(m.heroHallLevel));
  expect(Object.keys(m.petProgress.levels).length).toBeGreaterThan(0);
  expect(m.state.ores!.shiny).toBeGreaterThan(0);
  expect(m.troopLevel('giant')).toBeGreaterThan(1);
  expect(m.spellLevel('rage')).toBeGreaterThan(1);
  expect(validateSave(m.state)).toBe(true);

  // An early tier keeps early ceilings: no Hero Hall at Town Hall 3, so no heroes at all.
  dev.maxTownHall(3);
  expect(m.state.king).toBeUndefined();
  expect(m.state.heroes ?? {}).toEqual({});
  expect(validateSave(m.state)).toBe(true);
});

it('fills camps evenly, or with one troop, without exceeding housing', () => {
  const m = new GameModel();
  const dev = new DeveloperControls(m);
  dev.maxTownHall(10, { army: false });
  dev.setArmy(Object.fromEntries(TROOP_KEYS.map((k) => [k, 0])));
  expect(m.armySize).toBe(0);
  dev.fillArmy();
  expect(m.armySize).toBeLessThanOrEqual(m.capacity);
  expect(m.capacity - m.armySize).toBeLessThan(5);
  expect(TROOP_KEYS.filter((k) => m.state.army[k] > 0).length).toBeGreaterThan(3);
  expect(m.spellHousing).toBeLessThanOrEqual(m.spellCapacity);

  dev.fillArmy({ troop: 'archer', siege: false });
  expect(m.state.army.archer).toBe(Math.floor(m.capacity / TROOPS.archer.space));
  expect(TROOP_KEYS.filter((k) => k !== 'archer' && m.state.army[k] > 0)).toEqual([]);
  expect(armySpace(m.state.army)).toBeLessThanOrEqual(m.capacity);
});

it('distributes housing without overspending it', () => {
  const kinds = ['archer', 'giant', 'wizard'] as const;
  const army = distributeArmy(200, kinds);
  expect(armySpace(army)).toBeLessThanOrEqual(200);
  expect(200 - armySpace(army)).toBeLessThan(TROOPS.archer.space);
  for (const kind of kinds) expect(army[kind]).toBeGreaterThan(0);
  expect(armySpace(distributeArmy(0, kinds))).toBe(0);
  expect(armySpace(distributeArmy(200, []))).toBe(0);
  expect(singleArmy(31, 'giant').giant).toBe(Math.floor(31 / TROOPS.giant.space));
  const spells = distributeSpells(11, SPELL_KEYS.slice(0, 3));
  expect(spellSpace(spells)).toBeLessThanOrEqual(11);
  expect(11 - spellSpace(spells)).toBeLessThan(
    Math.min(...SPELL_KEYS.slice(0, 3).map((k) => SPELLS[k].space)),
  );
});

it('advances production and timers by a chosen span without moving the wall clock', () => {
  const m = new GameModel();
  const dev = new DeveloperControls(m);
  dev.maxTownHall(8, { resources: false });
  dev.setResources({ gold: 0, elixir: 0 });
  const before = Date.now();
  dev.advanceTime(24 * 3600);
  // Production lands in the mines and collectors, which the player still has to collect.
  expect(m.state.buildings.filter((b) => b.kind === 'goldmine').every((b) => b.stored > 0)).toBe(
    true,
  );
  m.collect();
  expect(m.state.gold).toBeGreaterThan(0);
  expect(m.state.elixir).toBeGreaterThan(0);
  expect(m.clock).toBeGreaterThanOrEqual(before);
  expect(m.clock).toBeLessThanOrEqual(Date.now());
  expect(validateSave(m.state)).toBe(true);
});

it('sets an explicit level for a building kind, a troop, a spell, a hero and a pet', () => {
  const m = new GameModel();
  const dev = new DeveloperControls(m);
  dev.maxTownHall(MAX_TOWNHALL);
  dev.setBuildingLevel('cannon', 7);
  expect(m.state.buildings.filter((b) => b.kind === 'cannon').map((b) => b.level)).toEqual(
    Array(m.countOf('cannon')).fill(7),
  );
  dev.setTroopLevel('archer', 3);
  expect(m.troopLevel('archer')).toBe(3);
  dev.setSpellLevel('rage', 2);
  expect(m.spellLevel('rage')).toBe(2);
  dev.setHeroLevel('king', 15);
  expect(m.state.king!.level).toBe(15);
  dev.setPetLevel('lassi', 4);
  expect(m.petProgress.levels.lassi).toBe(4);
  dev.setItemLevel('barbarian-puppet', 5);
  expect(m.gear.levels['barbarian-puppet']).toBe(5);
  expect(() => dev.setTroopLevel('archer', 999)).toThrow();
  expect(() => dev.setBuildingLevel('monolith', 99)).toThrow();
  expect(validateSave(m.state)).toBe(true);
});

it('exports and re-imports a village, rejecting anything that is not a valid save', () => {
  const m = new GameModel();
  const dev = new DeveloperControls(m);
  dev.maxTownHall(12);
  const text = dev.exportSave();
  dev.maxTownHall(1);
  expect(m.townhallLevel).toBe(1);
  dev.importSave(text);
  expect(m.townhallLevel).toBe(12);
  expect(validateSave(m.state)).toBe(true);
  expect(() => dev.importSave('not json')).toThrow('valid save JSON');
  expect(() => dev.importSave('{"version":4}')).toThrow('valid village');
});

it('destroys the weakest buildings up to a requested destruction percentage', () => {
  const m = new GameModel();
  const dev = new DeveloperControls(m);
  m.startBattle(0, true);
  dev.damageBattle(60);
  // Buildings are whole, so the tool lands on or just past the requested percentage.
  const scored = m.battle!.buildings.filter((b) => b.kind !== 'wall' && !isTrap(b.kind)).length;
  expect(m.battle!.destruction).toBeGreaterThanOrEqual(60);
  expect(m.battle!.destruction).toBeLessThan(60 + 100 / scored);
  expect(m.battle!.finished).toBe(false);
  // Walls and traps score nothing, so none of them are spent reaching the percentage.
  expect(m.battle!.buildings.some((b) => b.kind === 'wall' && b.hp > 0)).toBe(true);
  dev.damageBattle(100);
  expect(m.battle!.destruction).toBe(100);
  expect(m.battle!.stars).toBe(3);
  m.returnHome();
  expect(() => dev.damageBattle(50)).toThrow('Start an attack first.');
});

it('keeps developer army configurations in storage, rejecting malformed entries', () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  } as unknown as Storage;
  const m = new GameModel();
  new DeveloperControls(m).fillArmy({ troop: 'archer' });
  const saved = writeArmyConfig(
    { name: 'Mass archers', army: m.state.army, spells: m.state.spells },
    storage,
  );
  expect(saved.map((c) => c.name)).toEqual(['Mass archers']);
  expect(readArmyConfigs(storage)[0].army.archer).toBe(m.state.army.archer);
  // Re-saving the same name replaces it rather than growing the list.
  writeArmyConfig({ name: 'Mass archers', army: m.state.army, spells: m.state.spells }, storage);
  expect(readArmyConfigs(storage)).toHaveLength(1);
  expect(() =>
    writeArmyConfig({ name: '  ', army: m.state.army, spells: m.state.spells }, storage),
  ).toThrow();
  expect(deleteArmyConfig('Mass archers', storage)).toEqual([]);
  store.set('crown-clan-developer-armies', '{ not json');
  expect(readArmyConfigs(storage)).toEqual([]);
  store.set('crown-clan-developer-armies', JSON.stringify([{ name: 'bad', army: { archer: -1 } }]));
  expect(readArmyConfigs(storage)).toEqual([]);
});

it('keeps whole villages under a name and switches between them', () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  } as unknown as Storage;
  const m = new GameModel();
  const dev = new DeveloperControls(m);
  dev.maxTownHall(13);
  writeVillageSlot('Thirteen', m.state, storage);
  dev.maxTownHall(5);
  expect(m.townhallLevel).toBe(5);
  const slots = readVillageSlots(storage);
  expect(slots.map((s) => [s.name, s.townhall])).toEqual([['Thirteen', 13]]);
  dev.importSave(JSON.stringify(slots[0].save));
  expect(m.townhallLevel).toBe(13);
  expect(validateSave(m.state)).toBe(true);
  expect(() => writeVillageSlot(' ', m.state, storage)).toThrow();
  // A stored village that no longer validates is dropped rather than offered.
  store.set(
    'crown-clan-developer-villages',
    JSON.stringify([{ name: 'broken', save: { version: 4 } }]),
  );
  expect(readVillageSlots(storage)).toEqual([]);
  store.set('crown-clan-developer-villages', 'nonsense');
  expect(readVillageSlots(storage)).toEqual([]);
});

it('enters any campaign stage directly, unlocking the path without lowering stars', () => {
  const m = new GameModel();
  const dev = new DeveloperControls(m);
  dev.maxTownHall(9);
  m.state.stars[0] = 3;
  dev.startStage(6);
  expect(m.battle!.index).toBe(6);
  expect(m.state.stars[0]).toBe(3);
  m.returnHome();
  dev.startStage(20, 'goblin-v1');
  expect(m.battle!.index).toBe(20);
  expect(m.battle!.catalog).toBe('goblin-v1');
  m.returnHome();
  expect(() => dev.startStage(999)).toThrow();
  dev.startStage(0, 'valley-v1', true);
  expect(m.battle!.practice).toBe(true);
  expect(() => dev.startStage(1)).toThrow('Return home');
});

it('clears obstacles so their tiles are free again', () => {
  const m = new GameModel();
  const dev = new DeveloperControls(m);
  expect(m.obstacles.length).toBeGreaterThan(0);
  dev.clearObstacles();
  expect(m.obstacles).toEqual([]);
  expect(validateSave(m.state)).toBe(true);
});
