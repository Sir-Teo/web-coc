import { describe, it, expect } from 'vitest';
import {
  SPELL_LEVELS,
  SPELL_NAMES,
  SPELL_ROSTER,
  TROOP_LEVELS,
  TROOP_NAMES,
  TROOP_ROSTER,
} from '../src/game/troop-progression';
import { EQUIPMENT_NAMES, EQUIPMENT_ROSTER } from '../src/game/equipment';
import { SPELL_KEYS, TROOP_KEYS } from '../src/game/data';

const by = <T>(rows: Record<string, T>, pick: (value: T) => string) => {
  const counts: Record<string, number> = {};
  for (const value of Object.values(rows)) counts[pick(value)] = (counts[pick(value)] ?? 0) + 1;
  return counts;
};

describe('pinned rosters', () => {
  it('carries every troop the home village can produce, by production building', () => {
    expect(Object.keys(TROOP_ROSTER)).toHaveLength(90);
    expect(by(TROOP_ROSTER, (t) => t.building)).toEqual({
      Barracks: 61,
      'Dark Barracks': 19,
      'Siege Workshop': 10,
    });
    // A Super troop is a paid, temporary upgrade rather than a troop of its own.
    expect(Object.values(TROOP_ROSTER).filter((t) => t.superTroop)).toHaveLength(17);
    expect(Object.values(TROOP_ROSTER).reduce((n, t) => n + t.levels.length, 0)).toBe(931);
  });

  it('carries every spell the home village can produce', () => {
    expect(Object.keys(SPELL_ROSTER)).toHaveLength(23);
    expect(by(SPELL_ROSTER, (s) => s.building)).toEqual({
      'Spell Factory': 15,
      'Dark Spell Factory': 8,
    });
    expect(Object.values(SPELL_ROSTER).reduce((n, s) => n + s.levels.length, 0)).toBe(161);
    for (const name of ['Jump', 'Freeze', 'Clone', 'Poison', 'Earthquake', 'Haste'])
      expect(SPELL_ROSTER[name].levels.length).toBeGreaterThan(0);
  });

  it('carries every hero equipment record, placeholders marked not dropped', () => {
    expect(Object.keys(EQUIPMENT_ROSTER)).toHaveLength(61);
    expect(Object.values(EQUIPMENT_ROSTER).reduce((n, e) => n + e.levels.length, 0)).toBe(1032);
    for (const [name, record] of Object.entries(EQUIPMENT_ROSTER)) {
      expect(record.unused).toBe(name.startsWith('UNUSED'));
      expect(record.heroes.length).toBeGreaterThan(0);
      expect(['COMMON', 'EPIC']).toContain(record.rarity);
    }
    // Rarity sets the ceiling: common items reach eighteen, epic ones twenty-seven.
    expect(EQUIPMENT_ROSTER['Barbarian Puppet'].levels).toHaveLength(18);
    expect(EQUIPMENT_ROSTER['Giant Gauntlet'].levels).toHaveLength(27);
  });

  it('resolves every local key into the roster it names', () => {
    expect(Object.keys(TROOP_NAMES).sort()).toEqual([...TROOP_KEYS].sort());
    expect(Object.keys(SPELL_NAMES).sort()).toEqual([...SPELL_KEYS].sort());
    for (const kind of TROOP_KEYS)
      expect(TROOP_LEVELS[kind]).toBe(TROOP_ROSTER[TROOP_NAMES[kind]].levels);
    for (const kind of SPELL_KEYS)
      expect(SPELL_LEVELS[kind]).toBe(SPELL_ROSTER[SPELL_NAMES[kind]].levels);
    for (const name of Object.values(EQUIPMENT_NAMES)) expect(EQUIPMENT_ROSTER[name]).toBeDefined();
  });

  it('numbers a Super troop from the level of the troop it upgrades', () => {
    // The rows of a Super troop start where its base troop's unlock does, so the displayed
    // level is the row's own, not its position in the table.
    const zero = Object.entries(TROOP_ROSTER).filter(([, t]) => t.levels[0].level !== 1);
    expect(zero.map(([name]) => name).sort()).toEqual([
      'Rocket Balloon',
      'Sneaky Goblin',
      'Super Archer',
      'Super Barbarian',
      'Super Dragon',
      'Super Giant',
      'Super Hog Rider',
      'Super Minion',
      'Super Wall Breaker',
      'Super Wizard',
    ]);
    for (const [, troop] of zero) expect(troop.superTroop).toBe(true);
    expect(TROOP_ROSTER['Super Barbarian'].levels[0].level).toBe(5);
  });

  it('never lets a curve or a gate fall as a record levels', () => {
    for (const [name, troop] of Object.entries(TROOP_ROSTER))
      for (const [index, row] of troop.levels.slice(1).entries()) {
        const previous = troop.levels[index];
        expect(`${name} ${row.hp >= previous.hp}`).toBe(`${name} true`);
        expect(`${name} ${row.level === previous.level + 1}`).toBe(`${name} true`);
        expect(`${name} ${row.laboratory >= previous.laboratory}`).toBe(`${name} true`);
      }
    for (const [name, item] of Object.entries(EQUIPMENT_ROSTER))
      for (const [index, row] of item.levels.slice(1).entries())
        expect(`${name} ${row.blacksmith >= item.levels[index].blacksmith}`).toBe(`${name} true`);
  });
});
