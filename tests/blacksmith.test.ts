import { ReleasedGameModel as GameModel } from './fixtures/released-combat';
import { describe, it, expect } from 'vitest';
import { makeBuilding } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { BUILDINGS, maxCountFor, maxLevelFor } from '../src/game/data';
import {
  EQUIPMENT_MAX_LEVEL,
  defaultEquipment,
  equipmentCost,
  equipmentStats,
  type EquipmentKind,
} from '../src/game/equipment';
import { heroStatsFor } from '../src/game/native-heroes';
import { heroAbilityHeal } from '../src/game/native-heroes';
import { validateSave, migrateSave } from '../src/game/save';
import { validateReplay } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { spawnSkeleton } from '../src/game/defenders';

function village(blacksmith = true) {
  const m = new GameModel();
  m.state.obstacles = [];
  m.state.buildings = [
    makeBuilding(1, 'townhall', 20, 20, 8),
    makeBuilding(2, 'herohall', 4, 4, 2),
    makeBuilding(3, 'builder', 30, 30),
  ];
  if (blacksmith) m.state.buildings.push(makeBuilding(4, 'blacksmith', 8, 4));
  m.state.nextId = 5;
  m.state.king = { level: 20 };
  m.state.army = emptyArmy();
  m.state.spells = emptySpells();
  return m;
}
function arena(level = 1, loadout: [EquipmentKind, EquipmentKind] = ['boots', 'vial']) {
  const m = village();
  m.state.equipment = { levels: { puppet: level, vial: level, boots: level }, loadout };
  m.startBattle(0, true);
  m.deployHero(12, 15);
  return { m, b: m.battle!, king: m.battle!.units[0] };
}
describe('Blacksmith economy and persistence', () => {
  it('uses native TH8 count, footprint, price, duration and hitpoints', () => {
    expect(BUILDINGS.blacksmith).toMatchObject({
      size: 3,
      hp: 700,
      cost: 600000,
      build: 43200,
      resource: 'elixir',
    });
    expect(maxCountFor('blacksmith', 7)).toBe(0);
    expect(maxCountFor('blacksmith', 8)).toBe(1);
    expect(maxLevelFor('blacksmith', 8)).toBe(1);
    const m = village(false);
    m.state.elixir = 700000;
    m.beginBuild('blacksmith');
    expect(m.place(8, 4)).toBe(true);
    expect(m.state.elixir).toBe(100000);
    const building = m.state.buildings.at(-1)!;
    expect(building.upgradeEnd! - building.upgradeStart!).toBe(43200000);
    expect(m.blacksmith).toBeUndefined();
    expect(m.upgradeEquipment('puppet', 1, 120)).toBe(false);
    expect(m.equipKing('boots', 0)).toBe(false);
    m.tick(building.upgradeEnd!);
    expect(m.blacksmith).toBe(building);
    expect(m.busy).toBe(0);
    expect(validateSave(m.state)).toBe(true);
  });
  it.each(['puppet', 'vial', 'boots'] as const)(
    'charges every %s destination once, instantly, with no free builder required',
    (kind) => {
      const m = village();
      m.heroHall!.upgradeStart = m.clock;
      m.heroHall!.upgradeEnd = m.clock + 100000;
      expect(m.busy).toBe(m.builders);
      m.state.ores = { shiny: 10000, glowy: 1000, starry: 200 };
      const gems = m.state.gems;
      for (let level = 1; level < 9; level++) {
        const before = { ...m.ores },
          cost = equipmentCost(level + 1)!;
        expect(m.upgradeEquipment(kind, level)).toBe(true);
        expect(m.upgradeEquipment(kind, level)).toBe(false);
        expect(m.ores).toEqual({
          shiny: before.shiny - cost.shiny,
          glowy: before.glowy - cost.glowy,
          starry: 200,
        });
        expect(m.kingEquipment.levels[kind]).toBe(level + 1);
        expect(m.state.gems).toBe(gems);
      }
      expect(m.upgradeEquipment(kind, 9, 99999)).toBe(false);
      expect(m.busy).toBe(1);
      expect(validateSave(m.state)).toBe(true);
    },
  );
  it('requires an explicit affordable gem ceiling and refuses stale or repeated purchases', () => {
    const m = village();
    m.state.equipment = defaultEquipment();
    m.state.equipment.levels.puppet = 2;
    m.state.ores = { shiny: 230, glowy: 18, starry: 100 };
    m.state.gems = 19;
    const before = structuredClone(m.state);
    expect(m.upgradeEquipment('puppet', 2, 20)).toBe(false);
    expect(m.state).toEqual(before);
    m.state.gems = 20;
    expect(m.upgradeEquipment('puppet', 2)).toBe(false);
    expect(m.upgradeEquipment('puppet', 2, 19)).toBe(false);
    expect(m.upgradeEquipment('puppet', 2, 20)).toBe(true);
    expect(m.ores).toEqual({ shiny: 0, glowy: 0, starry: 100 });
    expect(m.state.gems).toBe(0);
    expect(m.upgradeEquipment('puppet', 2, 20)).toBe(false);
  });
  it('swaps occupied slots without duplicates and prevents changes during an attack', () => {
    const m = village();
    expect(m.equipKing('boots', 0)).toBe(true);
    expect(m.kingEquipment.loadout).toEqual(['boots', 'vial']);
    expect(m.equipKing('vial', 0)).toBe(true);
    expect(m.kingEquipment.loadout).toEqual(['vial', 'boots']);
    expect(m.equipKing('boots', 2)).toBe(false);
    m.startBattle(0, true);
    expect(m.equipKing('puppet', 1)).toBe(false);
    expect(m.upgradeEquipment('boots', 1, 120)).toBe(false);
    m.state.equipment!.levels.boots = 9;
    // The battle keeps the loadout snapshot taken when it started.
    expect(
      m.battle!.nativeHeroes![0].items.find((item) => item.slug === 'earthquake-boots')!.level,
    ).toBe(1);
  });
  it('retains legacy defaults, pre-Blacksmith ore and imported upgrades; rejects malformed gear', () => {
    const legacy = village(false).state;
    expect(validateSave(legacy)).toBe(true);
    expect(new GameModel(migrateSave(legacy) as typeof legacy).kingEquipment).toEqual(
      defaultEquipment(),
    );
    legacy.ores = { shiny: 100, glowy: 10, starry: 1 };
    expect(validateSave(legacy)).toBe(true);
    legacy.equipment = defaultEquipment();
    legacy.equipment.levels.vial = 2;
    expect(validateSave(legacy)).toBe(false);
    const m = village();
    m.state.equipment = { levels: { puppet: 9, vial: 6, boots: 3 }, loadout: ['boots', 'vial'] };
    m.state.ores = { shiny: 500, glowy: 10, starry: 4 };
    const restored = new GameModel(JSON.parse(JSON.stringify(m.state)));
    expect(restored.kingEquipment).toEqual(m.kingEquipment);
    expect(restored.ores).toEqual(m.ores);
    expect(validateSave(restored.state)).toBe(true);
    for (const equipment of [
      null,
      [],
      { ...m.kingEquipment, loadout: ['vial', 'vial'] },
      { ...m.kingEquipment, levels: { puppet: 1, vial: EQUIPMENT_MAX_LEVEL + 1, boots: 1 } },
    ])
      expect(validateSave({ ...m.state, equipment })).toBe(false);
  });
});
describe('equipped King combat and recordings', () => {
  it.each([1, 3, 6, 9])(
    'Boots level %i resolves five timed max-HP pulses, walls, footprint edges and ground defenders',
    (level) => {
      const { m, b, king } = arena(level);
      king.x = king.y = 20;
      b.buildings = [
        makeBuilding(20, 'townhall', 28, 20),
        makeBuilding(21, 'goldstorage', 20, 27),
        makeBuilding(22, 'wall', 21, 20, 8),
        makeBuilding(23, 'cannon', 28.01, 20),
        makeBuilding(24, 'bomb', 20, 20),
        makeBuilding(25, 'tesla', 20, 20),
      ];
      const source = makeBuilding(26, 'skeletontrap', 20, 20);
      const ground = spawnSkeleton(b, source, 0, 0);
      const air = spawnSkeleton(b, { ...source, skeletonMode: 'air' }, 0, 1);
      const late = spawnSkeleton(b, source, 0.8, 2);
      const stats = equipmentStats('boots', level),
        before = b.buildings.map((v) => v.hp);
      // Version 46 runs the Earthquake Boots Spell through the native spell engine.
      const step = (at: number) => {
        while (b.elapsed < at - 1e-9 && !b.finished) m.step(Math.min(0.05, at - b.elapsed));
      };
      m.activateHeroAbility();
      expect(b.units).toHaveLength(1);
      // The spell keeps the cast position, so park the King away from the arena and measure it alone.
      king.x = king.y = 45;
      step(0.699);
      expect(b.buildings.map((v) => v.hp)).toEqual(before);
      step(0.7);
      expect(b.buildings[2].hp).toBe(0);
      expect(ground.hp).toBeCloseTo(ground.maxHp * (1 - stats.quakeTroop));
      expect(late.hp).toBe(late.maxHp);
      // The quake keeps pulsing wherever the King goes: the spell is independent of its caster.
      step(2.3);
      step(4);
      for (const i of [0, 1])
        expect(b.buildings[i].hp).toBeCloseTo(before[i] * (1 - stats.quakeBuilding * 5));
      for (const i of [3, 4, 5]) expect(b.buildings[i].hp).toBe(before[i]);
      expect(ground.hp).toBeCloseTo(ground.maxHp * (1 - stats.quakeTroop * 5));
      expect(late.hp).toBeCloseTo(late.maxHp * (1 - stats.quakeTroop * 4));
      expect(air.hp).toBe(air.maxHp);
      expect(b.nativeSpells ?? []).toEqual([]);
    },
  );
  it('uses equipped passive stats, recovery, summon count and independent boost', () => {
    const { m, b, king } = arena(9, ['puppet', 'boots']);
    expect(king.maxHp).toBe(2309 + 1045 + 522);
    const hero = m.battleHero('king')!;
    expect(heroStatsFor(hero, 8).dps).toBe(148 + 32);
    king.hp = 100;
    m.activateHeroAbility();
    expect(king.hp).toBe(100 + heroAbilityHeal(hero, 8));
    // Without a Rage Vial the ability grants no boost.
    expect(king.native?.effects?.boost).toBeUndefined();
    for (let i = 0; i < 50; i++) m.step(0.05);
    expect(b.units.filter((u) => u.summoned)).toHaveLength(30);
    expect(b.units.filter((u) => u.summoned).at(-1)!.spawnedAt).toBe(2.5);
    const target = makeBuilding(999, 'townhall', 39, 39);
    target.hp = target.maxHp = 100000;
    b.buildings = [target];
    for (const unit of b.units) {
      unit.x = 5;
      unit.y = 5;
      unit.cooldown = 100;
    }
    const summon = b.units[1];
    summon.x = 38.9;
    summon.y = 40;
    summon.target = 999;
    summon.cooldown = 0;
    m.step(0.05);
    expect(target.maxHp - target.hp).toBeCloseTo(m.troopStats('swordsman').damage * 2.6);
  });
  it('round-trips gear in portable replays and seeks without home equipment or ore mutations', () => {
    const { m, b } = arena(9, ['puppet', 'boots']);
    m.activateHeroAbility();
    for (let i = 0; i < 80; i++) m.step(0.05);
    m.finishBattle();
    const data = parseReplayFile(JSON.stringify(makeReplayFile(m.state.raidLog![0].replay!)));
    expect(data.initial.heroes![0].items).toEqual([
      { slug: 'barbarian-puppet', level: 9 },
      { slug: 'earthquake-boots', level: 9 },
    ]);
    const viewer = new GameModel();
    const home = structuredClone(viewer.state);
    expect(viewer.openReplay(data)).toBe(true);
    for (let i = 0; i < 200 && !viewer.replay!.complete; i++) viewer.step(0.05);
    expect(viewer.battle!.units).toEqual(b.units);
    expect(viewer.battle!.buildings).toEqual(b.buildings);
    for (const at of [0.6, 1.2, 0.6, 2.4]) {
      viewer.seekReplay(at);
      for (let i = 0; i < 200 && viewer.replay!.seeking; i++) viewer.step(0.05);
      expect(viewer.battle!.nativeHeroes![0].items).toEqual(data.initial.heroes![0].items);
    }
    expect(viewer.state).toEqual(home);
    const missing = structuredClone(data);
    missing.initial.heroes![0].items[0].level = 99;
    expect(validateReplay(missing)).toBe(false);
    // A hero roster only exists from version 46; older recordings carry the single King instead.
    missing.initial.heroes![0].items[0].level = 9;
    missing.version = 45;
    expect(validateReplay(missing)).toBe(false);
    delete missing.initial.heroes;
    missing.initial.hero = { level: 20, townhall: 8 };
    missing.version = 23;
    expect(validateReplay(missing)).toBe(true);
    expect(viewer.openReplay(missing)).toBe(false);
  });
});
