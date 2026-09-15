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
    for (const level of [0, 1, 10, 1.5, NaN, Infinity]) expect(equipmentCost(level)).toBeNull();
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
      { ...defaultEquipment(), levels: { puppet: 1, vial: 1, boots: 10 } },
      { ...defaultEquipment(), loadout: ['puppet', ['vial']] },
    ])
      expect(validEquipment(value)).toBe(false);
    expect(validOres({ shiny: 10000, glowy: 1000, starry: 200 })).toBe(true);
    for (const value of [
      null,
      [],
      {},
      { shiny: -1, glowy: 0, starry: 0 },
      { shiny: 0.5, glowy: 0, starry: 0 },
      // Blacksmith 10 stores at most 50,000 Shiny Ore.
      { shiny: 50001, glowy: 0, starry: 0 },
      { shiny: 1, glowy: Infinity, starry: 0 },
    ])
      expect(validOres(value)).toBe(false);
  });
});
