import { describe, expect, it } from 'vitest';
import { GameModel, initialSave, makeBuilding } from '../src/game/model';
import { migrateSave, validateSave } from '../src/game/save';
import { SPELL_KEYS, TROOP_KEYS } from '../src/game/data';

/**
 * A village saved by the released build has to keep opening. Its spell book names nine spells,
 * its army names ten troops, its Spell Towers carry the campaign weapon field, and its Eagle
 * Artillery is `eagleartillery` — none of which this game may quietly stop accepting.
 */
const RELEASED_TROOPS = [
  'swordsman',
  'archer',
  'giant',
  'wizard',
  'balloon',
  'goblin',
  'wallbreaker',
  'healer',
  'dragon',
  'pekka',
];
const RELEASED_SPELLS = [
  'rage',
  'heal',
  'lightning',
  'freeze',
  'invisibility',
  'jump',
  'clone',
  'recall',
  'revive',
];
/** A real village, written back down to the shape the released build saved. */
function releasedSave() {
  const save = initialSave() as unknown as Record<string, any>;
  const only = (book: Record<string, number>, keys: string[]) =>
    Object.fromEntries(keys.map((k) => [k, book[k] ?? 0]));
  save.army = only(save.army, RELEASED_TROOPS);
  save.spells = only(save.spells ?? {}, RELEASED_SPELLS);
  if (save.troopLevels) save.troopLevels = only(save.troopLevels, RELEASED_TROOPS);
  if (save.spellLevels) save.spellLevels = only(save.spellLevels, RELEASED_SPELLS);
  if (save.lastArmy) save.lastArmy = only(save.lastArmy, RELEASED_TROOPS);
  if (save.lastSpells) save.lastSpells = only(save.lastSpells, RELEASED_SPELLS);
  save.nextId = 500;
  save.gold = 1000;
  save.spells = { ...save.spells, lightning: 2, freeze: 1 };
  // A level the Town Hall 16 village's own Hero Hall permits.
  save.king = { level: 40 };
  save.equipment = { levels: { puppet: 18, vial: 12, boots: 9 }, loadout: ['puppet', 'vial'] };
  save.ores = { shiny: 12000, glowy: 800, starry: 120 };
  // The families the released build could own, under the names it saved them with.
  save.buildings = [
    makeBuilding(1, 'townhall', 20, 20, 16),
    makeBuilding(2, 'eagleartillery', 8, 30, 7),
    makeBuilding(3, 'scattershot', 24, 24, 7),
    makeBuilding(4, 'monolith', 30, 12, 5),
    { ...makeBuilding(5, 'spelltower', 16, 12, 4), spellTowerWeapon: 'poison' as const },
    makeBuilding(6, 'tornadotrap', 40, 8, 3),
    makeBuilding(7, 'builder', 2, 2, 4),
    makeBuilding(8, 'herohall', 34, 34, 9),
    makeBuilding(9, 'blacksmith', 38, 34, 10),
    makeBuilding(10, 'laboratory', 30, 30, 12),
  ];
  save.obstacles = [];
  return save;
}

describe('a village saved by the released build', () => {
  it('migrates, validates and opens with every count it held', () => {
    const save = releasedSave();
    // The released save has no field for anything added since; loading has to supply them.
    expect(Object.keys(save.spells)).toHaveLength(RELEASED_SPELLS.length);
    expect(Object.keys(save.army)).toHaveLength(RELEASED_TROOPS.length);
    const migrated = migrateSave(structuredClone(save)) as typeof save;
    expect(migrated).toBeTruthy();
    expect(validateSave(migrated)).toBe(true);

    const m = new GameModel(migrated as never);
    // Nothing the village owned is lost, and the fields it never had arrive empty.
    expect(m.state.buildings).toHaveLength(10);
    expect(m.state.buildings.find((b) => b.kind === 'eagleartillery')!.level).toBe(7);
    expect(m.state.buildings.find((b) => b.kind === 'spelltower')!.spellTowerWeapon).toBe('poison');
    expect(m.state.gold).toBe(1000);
    expect(m.state.king).toEqual({ level: 40 });
    // Every count the released save held is still there, whatever the starter village holds.
    expect(m.state.army).toMatchObject(save.army);
    expect(m.state.spells).toMatchObject(save.spells);
    for (const kind of TROOP_KEYS) expect(typeof m.state.army[kind]).toBe('number');
    for (const kind of SPELL_KEYS) expect(typeof m.state.spells[kind]).toBe('number');
    expect(m.kingEquipment.levels.puppet).toBe(18);
    expect(m.ores.shiny).toBe(12000);
  });

  it('can still attack and be attacked after loading', () => {
    const migrated = migrateSave(structuredClone(releasedSave())) as never;
    const m = new GameModel(migrated);
    m.state.army = { ...m.state.army, giant: 4 };
    m.startBattle(0, true);
    expect(m.battle).toBeTruthy();
    m.activeTroop = 'giant';
    expect(m.deploy(2, 40)).toBe(true);
    for (let i = 0; i < 200 && !m.battle!.finished; i++) m.step(0.05);
    expect(Number.isFinite(m.battle!.destruction)).toBe(true);
    m.finishBattle();
    expect(validateSave(m.state)).toBe(true);
  });
});
