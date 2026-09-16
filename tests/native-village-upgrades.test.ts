import { describe, expect, it } from 'vitest';
import { maxCountFor } from '../src/game/data';
import { GameModel, makeBuilding, type Building } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { nativeGearedWeapon, nativeWeapon, revengeTier } from '../src/game/native-defense-stats';
import { superchargeBonus, superchargeQuote } from '../src/game/native-supercharge';
import { consumedByMerges, gearUpQuote, mergeInputs, mergeQuote } from '../src/game/native-merges';
import { validateSave } from '../src/game/save';

function village(townhall: number, extra: Building[] = []) {
  const m = new GameModel();
  m.state.obstacles = [];
  m.state.buildings = [
    makeBuilding(1, 'townhall', 20, 20, townhall),
    ...[2, 3, 4, 5, 6].map((id, i) => makeBuilding(id, 'builder', 2 + i * 3, 2, 1)),
    ...extra,
  ];
  m.state.nextId = 1000;
  m.state.gold = 1e9;
  m.state.elixir = 1e9;
  m.state.dark = 1e7;
  m.state.gems = 1e6;
  return m;
}
const select = (m: GameModel, id: number) => {
  (m as unknown as { selection: number | null }).selection = id;
  m.selected = id;
};

describe('Town Hall 11-18 village upgrades', () => {
  it('reads merge recipes and gear-up prices from the client rows', () => {
    expect(mergeInputs('ricochetcannon')).toEqual([
      { kind: 'cannon', level: 21, geared: false },
      { kind: 'cannon', level: 21, geared: false },
    ]);
    expect(mergeInputs('multigeartower')).toEqual([
      { kind: 'archertower', level: 21, geared: true },
      { kind: 'cannon', level: 21, geared: true },
    ]);
    expect(mergeInputs('superwizardtower')[0]).toEqual({
      kind: 'wizardtower',
      level: 17,
      geared: false,
    });
    expect(mergeQuote('ricochetcannon')).toMatchObject({ cost: 12_000_000, townhall: 16 });
    expect(gearUpQuote('cannon')).toMatchObject({
      level: 7,
      cost: 1_000_000,
      seconds: 2 * 86400,
      limit: 1,
    });
    expect(gearUpQuote('archertower')).toMatchObject({
      level: 10,
      cost: 3_000_000,
      seconds: 7 * 86400,
    });
    expect(gearUpQuote('mortar')).toMatchObject({ level: 8, cost: 6_000_000, seconds: 14 * 86400 });
    // Burst Cannon: 174.08 per ball at level 21 (official wiki).
    expect(nativeGearedWeapon('cannon', 21).damage).toBeCloseTo(174.08, 6);
    expect(nativeGearedWeapon('archertower', 21)).toMatchObject({ interval: 0.25, range: 8 });
    expect(nativeGearedWeapon('mortar', 18)).toMatchObject({ burst: 3, minRange: 4, splash: 1.5 });
  });

  it('merges two level 21 Cannons into a Ricochet Cannon and lowers the Cannon limit', () => {
    const m = village(16, [
      makeBuilding(10, 'cannon', 30, 30, 21),
      makeBuilding(11, 'cannon', 34, 30, 21),
      makeBuilding(12, 'cannon', 38, 30, 20),
    ]);
    const before = m.maxCount('cannon');
    expect(before).toBe(maxCountFor('cannon', 16));
    expect(m.merge('ricochetcannon', 11)).toBe(true);
    const merged = m.state.buildings.find((b) => b.kind === 'ricochetcannon')!;
    expect([merged.x, merged.y, merged.constructing]).toEqual([34, 30, true]);
    expect(m.state.buildings.filter((b) => b.kind === 'cannon').map((b) => b.id)).toEqual([12]);
    expect(m.maxCount('cannon')).toBe(before - 2);
    expect(consumedByMerges('cannon', m.state.buildings, 16)).toBe(2);
    // The level 20 Cannon cannot be merged.
    expect(m.mergeCandidates('ricochetcannon').issue).toMatch(/Cannon level 21/);
    expect(validateSave(m.state)).toBe(true);
  });

  it('requires every Town Hall 16 merge before Town Hall 17 and merges the Eagle Artillery', () => {
    const m = village(16, [makeBuilding(10, 'eagleartillery', 30, 30, 7)]);
    m.upgrade(1);
    expect(m.state.buildings.find((b) => b.id === 1)!.upgradeEnd).toBeUndefined();
    expect(m.townHallMergeIssue()).toMatch(/Ricochet Cannon/);
    for (let i = 0; i < 2; i++) {
      m.state.buildings.push(makeBuilding(m.state.nextId++, 'ricochetcannon', 2 + i * 4, 40, 1));
      m.state.buildings.push(makeBuilding(m.state.nextId++, 'multiarchertower', 2 + i * 4, 44, 1));
    }
    expect(m.townHallMergeIssue()).toBeNull();
    m.upgrade(1);
    expect(m.state.buildings.find((b) => b.id === 1)!.upgradeEnd).toBeDefined();
    expect(m.state.buildings.some((b) => b.kind === 'eagleartillery')).toBe(false);
    expect(m.maxCount('eagleartillery')).toBe(0);
  });

  it('gears up one Cannon, which then fires native 4-ball bursts in version 45 battles', () => {
    const m = village(12, [
      makeBuilding(10, 'cannon', 30, 30, 21),
      makeBuilding(11, 'cannon', 34, 30, 21),
    ]);
    expect(m.gearUp(10)).toBe(true);
    expect(m.gearUp(11)).toBe(false);
    const cannon = m.state.buildings.find((b) => b.id === 10)!;
    m.tick(cannon.upgradeEnd! + 1);
    expect(cannon.geared).toBe(true);
    expect(validateSave(m.state)).toBe(true);
    m.state.buildings = m.state.buildings.filter((b) => b.id !== 11);
    m.state.army = { ...emptyArmy(), golem: 1 };
    m.state.spells = emptySpells();
    m.startBattle(0, true);
    m.activeTroop = 'golem';
    m.deploy(31.5, 26);
    const golem = m.battle!.units[0];
    golem.springUntil = 1e9;
    for (let i = 0; i < 20; i++) m.step(0.05);
    const shots = (m.battle!.projectiles ?? []).filter((p) => p.sourceId === 10);
    expect(shots.length + (golem.maxHp - golem.hp) / 174.08).toBeGreaterThanOrEqual(4 - 1e-6);
  });

  it('cycles Spell Tower spells, toggles Multi-Gear modes and turns the Firespitter in 90-degree steps', () => {
    const m = village(17, [
      makeBuilding(10, 'spelltower', 30, 30, 4),
      makeBuilding(11, 'multigeartower', 34, 30, 1),
      makeBuilding(12, 'firespitter', 38, 30, 1),
    ]);
    select(m, 10);
    expect(m.cycleSpellTowerMode()).toBe(true);
    expect(m.state.buildings.find((b) => b.id === 10)!.spellMode).toBe('poison');
    select(m, 11);
    expect(m.toggleGearMode()).toBe(true);
    expect(m.state.buildings.find((b) => b.id === 11)!.gearMode).toBe('fast');
    select(m, 12);
    expect(m.rotateSweeper()).toBe(true);
    expect(m.state.buildings.find((b) => b.id === 12)!.direction).toBe(2);
    expect(validateSave(m.state)).toBe(true);
  });

  it('supercharges maxed buildings with cumulative client bonuses', () => {
    expect(superchargeBonus('inferno', 2)).toMatchObject({
      dps: 10,
      dpsLv2: 20,
      dpsLv3: 200,
      hp: 200,
    });
    expect(superchargeBonus('goldmine', 3)).toMatchObject({
      production: 594,
      capacity: 33000,
      hp: 50,
    });
    // Official wiki: Ricochet Cannon charge 1 = 420 DPS / 336 per shot; Revenge Tower stage 1 = 510.
    expect(nativeWeapon('ricochetcannon', 4, { supercharge: 1 })!.damage).toBeCloseTo(336, 6);
    expect(revengeTier(2, 5, 1).damage).toBe(510);
    expect(revengeTier(2, 30, 1).damage).toBe(260);
    const m = village(18, [makeBuilding(10, 'scattershot', 30, 30, 7)]);
    const tower = m.state.buildings.find((b) => b.id === 10)!;
    const hp = tower.maxHp;
    expect(superchargeQuote('scattershot', 0)).toMatchObject({ cost: 14_500_000, charge: 1 });
    expect(m.supercharge(10)).toBe(true);
    expect(validateSave(m.state)).toBe(true);
    m.tick(tower.upgradeEnd! + 1);
    expect([tower.supercharge, tower.maxHp]).toEqual([1, hp]);
    expect(m.supercharge(10)).toBe(true);
    m.tick(tower.upgradeEnd! + 1);
    expect([tower.supercharge, tower.maxHp]).toEqual([2, hp + 150]);
    expect(m.supercharge(10)).toBe(false);
    expect(validateSave(m.state)).toBe(true);
  });

  it('upgrades the Inferno Artillery weapon level with a builder at Town Hall 17', () => {
    const m = village(17);
    const th = m.state.buildings[0];
    const gold = m.state.gold;
    expect(m.upgradeTownHallWeapon(1)).toBe(true);
    expect(gold - m.state.gold).toBe(10_000_000);
    expect(th.improving).toBe('weapon');
    expect(validateSave(m.state)).toBe(true);
    m.tick(th.upgradeEnd! + 1);
    expect([th.level, th.weaponLevel, th.improving]).toEqual([17, 2, undefined]);
  });
});
