import { describe, expect, it } from 'vitest';
import {
  defaultEquipment,
  equipmentStats,
  equipmentBonuses,
  equipmentCost,
  equipmentQuote,
  validEquipment,
  validOres,
  emptyOres,
  EQUIPMENT_MAX_LEVEL,
  ORE_CAP,
} from '../src/game/equipment';

describe('native TH8 King equipment', () => {
  it('uses destination prices, including each third-level Glowy charge', () => {
    expect(Array.from({ length: 8 }, (_, i) => equipmentCost(i + 2))).toEqual([
      { shiny: 120, glowy: 0, starry: 0 },
      { shiny: 240, glowy: 20, starry: 0 },
      { shiny: 400, glowy: 0, starry: 0 },
      { shiny: 600, glowy: 0, starry: 0 },
      { shiny: 840, glowy: 100, starry: 0 },
      { shiny: 1120, glowy: 0, starry: 0 },
      { shiny: 1440, glowy: 0, starry: 0 },
      { shiny: 1800, glowy: 200, starry: 0 },
    ]);
    // Levels 10 to 18, which Blacksmith 3, 5 and 7 open. Glowy still lands every third level.
    expect(
      Array.from({ length: 9 }, (_, i) => equipmentCost(i + 10)).map((c) => [c!.shiny, c!.glowy]),
    ).toEqual([
      [1900, 0],
      [2000, 0],
      [2100, 400],
      [2200, 0],
      [2300, 0],
      [2400, 600],
      [2500, 0],
      [2600, 0],
      [2700, 600],
    ]);
    // These three items never charge Starry Ore, at any level.
    for (let level = 2; level <= EQUIPMENT_MAX_LEVEL; level++)
      expect(equipmentCost(level)!.starry, `level ${level}`).toBe(0);
    for (const level of [0, 1, EQUIPMENT_MAX_LEVEL + 1, 1.5, NaN, Infinity])
      expect(equipmentCost(level)).toBeNull();
  });
  it('quotes only the shortfall at native 1/5/35 gem rates', () => {
    expect(equipmentQuote(3, { shiny: 230, glowy: 18, starry: 200 })).toEqual({
      cost: { shiny: 240, glowy: 20, starry: 0 },
      missing: { shiny: 10, glowy: 2, starry: 0 },
      gems: 20,
    });
    expect(equipmentQuote(9, emptyOres())?.gems).toBe(2800);
    expect(equipmentQuote(2, { shiny: 500, glowy: 0, starry: 0 })?.gems).toBe(0);
  });
  it('preserves level-one gear and changes only the equipped items', () => {
    expect(equipmentBonuses()).toMatchObject({
      hp: 309,
      dps: 17,
      recovery: 260,
      summons: 8,
      damage: 2.2,
    });
    const gear = defaultEquipment();
    gear.levels = { puppet: 9, vial: 9, boots: 9 };
    expect(equipmentBonuses(gear)).toMatchObject({
      hp: 1045,
      dps: 60,
      recovery: 1352,
      summons: 30,
      summonDamage: 2.6,
      summonSpeedBoost: 2.4,
      damage: 2.4,
      speedBoost: 3.6,
    });
    gear.loadout = ['boots', 'vial'];
    expect(equipmentBonuses(gear)).toMatchObject({
      hp: 522,
      dps: 92,
      recovery: 780,
      summons: 0,
      quakeBuilding: 0.068,
      quakeTroop: 0.014,
    });
    expect(equipmentStats('puppet', 6).summons).toBe(20);
    expect(equipmentStats('boots', 3).quakeBuilding).toBe(0.04);
  });
  it('rejects duplicate slots, invalid levels and noninteger or oversized ore balances', () => {
    expect(validEquipment(defaultEquipment())).toBe(true);
    for (const value of [
      null,
      [],
      {},
      { levels: { puppet: 1, vial: 1, boots: 1 }, loadout: ['puppet', 'puppet'] },
      { ...defaultEquipment(), levels: { puppet: 1, vial: 1, boots: EQUIPMENT_MAX_LEVEL + 1 } },
      { ...defaultEquipment(), loadout: ['puppet', ['vial']] },
    ])
      expect(validEquipment(value)).toBe(false);
    // A level 10 forge stores 50,000 / 5,000 / 1,000, which is what bounds a saved balance.
    expect(validOres({ shiny: 10000, glowy: 1000, starry: 200 })).toBe(true);
    expect(validOres(ORE_CAP)).toBe(true);
    for (const value of [
      null,
      [],
      {},
      { shiny: -1, glowy: 0, starry: 0 },
      { shiny: 0.5, glowy: 0, starry: 0 },
      { shiny: ORE_CAP.shiny + 1, glowy: 0, starry: 0 },
      { shiny: 1, glowy: Infinity, starry: 0 },
    ])
      expect(validOres(value)).toBe(false);
  });
});
