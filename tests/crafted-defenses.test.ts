import { describe, expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import {
  candleTargets,
  craftedStats,
  moduleUpgrade,
  validCraftedFields,
} from '../src/game/crafted-defenses';
import { BUILDINGS, maxCountFor, unlockTownHall, isDefense } from '../src/game/data';
import { validateSave } from '../src/game/save';
import { validateReplay } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

function village(crafted?: 'candle' | 'hunter' | 'cake', townhall = 18) {
  const m = new GameModel();
  m.state.obstacles = [];
  const station = makeBuilding(4, 'craftingstation', 20, 12);
  if (crafted) station.crafted = crafted;
  m.state.buildings = [
    makeBuilding(1, 'townhall', 20, 20, townhall),
    makeBuilding(2, 'builder', 30, 30),
    makeBuilding(3, 'builder', 34, 30),
    station,
  ];
  m.state.nextId = 5;
  m.state.gold = m.state.elixir = 30_000_000;
  m.state.dark = 400_000;
  m.state.army = emptyArmy();
  m.state.spells = emptySpells();
  m.tick(m.clock);
  return { m, station };
}

describe('Crafted Defense data', () => {
  it('reads the module tables the client and wiki agree on', () => {
    expect(craftedStats('candle', [1, 1, 1])).toMatchObject({
      hp: 1600,
      damage: 40,
      range: 10.5,
      stageTargets: [6, 4, 3],
      stageStarts: [60, 95],
    });
    expect(craftedStats('candle', [10, 10, 10])).toMatchObject({ hp: 6000, damage: 125 });
    expect(craftedStats('hunter', [1, 10, 10])).toMatchObject({
      damage: 231,
      heroMultiplier: 2,
      poisonLevel: 12,
    });
    expect(craftedStats('cake', [1, 1, 10])).toMatchObject({
      minRange: 3,
      range: 12,
      bombDamage: 950,
    });
    expect(moduleUpgrade('candle', 0, 1)).toEqual({
      level: 2,
      cost: 3_500_000,
      seconds: 6 * 3600,
      resource: 'elixir',
      townHall: 12,
    });
    expect(moduleUpgrade('cake', 2, 10)).toBeNull();
    const stats = craftedStats('candle', [1, 1, 1]);
    expect([0, 59, 60, 94, 95, 200].map((t) => candleTargets(stats, t))).toEqual([
      6, 6, 4, 4, 3, 3,
    ]);
  });

  it('is one free defense at Town Hall 18 only', () => {
    expect(isDefense('craftingstation')).toBe(true);
    expect(unlockTownHall('craftingstation')).toBe(18);
    expect(maxCountFor('craftingstation', 17)).toBe(0);
    expect(maxCountFor('craftingstation', 18)).toBe(1);
    expect(BUILDINGS.craftingstation.cost).toBe(0);
  });
});

describe('Crafting Station', () => {
  it('switches defenses freely, keeping each one’s modules and hitpoints', () => {
    const { m, station } = village();
    expect(station.maxHp).toBe(1000);
    expect(m.chooseCrafted(station.id, 'hunter')).toBe(true);
    expect(station.maxHp).toBe(1600);
    expect(m.upgradeCraftedModule(station.id, 'hunter', 0)).toBe(true);
    expect(m.busy).toBe(1);
    m.tick(station.upgradeEnd!);
    expect(station.craftedModules!.hunter).toEqual([2, 1, 1]);
    expect(station.maxHp).toBe(1800);
    expect(station.level).toBe(1);
    expect(m.chooseCrafted(station.id, 'cake')).toBe(true);
    expect(station.maxHp).toBe(1600);
    m.chooseCrafted(station.id, 'hunter');
    expect(station.maxHp).toBe(1800);
    expect(validateSave(JSON.parse(JSON.stringify(m.state)))).toBe(true);
  });

  it('upgrades one module at a time and rejects impossible saves', () => {
    const { m, station } = village('candle');
    expect(m.upgradeCraftedModule(station.id, 'candle', 1)).toBe(true);
    expect(m.upgradeCraftedModule(station.id, 'candle', 2)).toBe(false);
    expect(validateSave(JSON.parse(JSON.stringify(m.state)))).toBe(true);
    const bad = JSON.parse(JSON.stringify(m.state));
    bad.buildings.find((b: { id: number }) => b.id === station.id).craftedModules = {
      candle: [11, 1, 1],
    };
    expect(validateSave(bad)).toBe(false);
    expect(validCraftedFields({ kind: 'cannon', crafted: 'cake' })).toBe(false);
  });

  it('an empty station does not fight', () => {
    const { m } = village();
    m.state.army.swordsman = 5;
    m.startBattle(0, true);
    expect(m.battle).not.toBeNull();
  });
});

/** Open grass about `distance` tiles from a point. */
function grassAt(m: GameModel, near: { x: number; y: number }, distance: number) {
  let best: { x: number; y: number; d: number } | null = null;
  for (let x = 1.5; x < 44; x++)
    for (let y = 1.5; y < 44; y++)
      if (!m.deployBlocked(x, y)) {
        const d = Math.abs(Math.hypot(x - near.x, y - near.y) - distance);
        if (!best || d < best.d) best = { x, y, d };
      }
  return best!;
}

describe('Crafted Defenses in battle', () => {
  const grass = (m: GameModel, near: { x: number; y: number }) => {
    let best: { x: number; y: number; d: number } | null = null;
    for (let x = 1.5; x < 44; x++)
      for (let y = 1.5; y < 44; y++)
        if (!m.deployBlocked(x, y)) {
          const d = Math.hypot(x - near.x, y - near.y);
          if (!best || d < best.d) best = { x, y, d };
        }
    return best!;
  };
  const fight = (crafted: 'candle' | 'hunter' | 'cake', setup: (m: GameModel) => void) => {
    // A Town Hall 10 keeps the Guardian and Town Hall weapons out of the fight.
    const { m, station } = village(crafted, 10);
    setup(m);
    m.startBattle(0, true);
    const spot = grass(m, { x: station.x + 1.5, y: station.y + 1.5 });
    return { m, station, spot };
  };

  it('the Hot Candle burns several troops at once', () => {
    const { m, spot } = fight('candle', (m) => (m.state.army.swordsman = 6));
    m.activeTroop = 'swordsman';
    for (let i = 0; i < 6; i++) m.deploy(spot.x, spot.y);
    for (let t = 0; t < 40; t++) m.step(0.05);
    const hurt = m.battle!.units.filter((u) => u.hp < u.maxHp);
    expect(hurt.length).toBeGreaterThan(1);
  });

  it('the Cake-A-Pult leaves a bomb that explodes after its fuse', () => {
    const { m, station } = fight('cake', (m) => (m.state.army.giant = 4));
    // Giants land outside the three-tile blind spot and take the cake's splash.
    const far = grassAt(m, { x: station.x + 1.5, y: station.y + 1.5 }, 7);
    m.activeTroop = 'giant';
    for (let i = 0; i < 4; i++) expect(m.deploy(far.x, far.y)).toBe(true);
    const state = () => m.battle!.nativeDefenses?.[station.id];
    for (let t = 0; t < 200 && !state()?.bombs?.length; t++) m.step(0.05);
    const bomb = state()!.bombs![0];
    expect(bomb.damage).toBe(400);
    for (let t = 0; t < 200 && m.battle!.elapsed < bomb.at - 0.06; t++) m.step(0.05);
    expect(m.battle!.finished).toBe(false);
    const before = m.battle!.units.reduce((sum, u) => sum + Math.max(0, u.hp), 0);
    m.step(0.05);
    m.step(0.05);
    const after = m.battle!.units.reduce((sum, u) => sum + Math.max(0, u.hp), 0);
    expect(state()!.bombs?.some((b) => b.at === bomb.at) ?? false).toBe(false);
    expect(after).toBeLessThan(before);
  });

  it('the Hero Hunter poisons what it hits', () => {
    const { m, station, spot } = fight('hunter', (m) => (m.state.army.giant = 2));
    m.activeTroop = 'giant';
    m.deploy(spot.x, spot.y);
    let poisoned = false;
    for (let t = 0; t < 200 && !poisoned; t++) {
      m.step(0.05);
      poisoned = !!m.battle!.units.some((u) => u.native?.effects?.poison);
    }
    expect(poisoned).toBe(true);
    expect(m.battle!.nativeDefenses![station.id].poisons?.length).toBeGreaterThan(0);
  });

  it('records a station battle that validates and survives export', () => {
    const { m } = fight('hunter', (m) => (m.state.army.giant = 1));
    m.finishBattle();
    const replay = m.state.raidLog![0].replay!;
    expect(validateReplay(replay)).toBe(true);
    const file = parseReplayFile(JSON.stringify(makeReplayFile(replay)));
    expect(file.initial.buildings.find((b) => b.kind === 'craftingstation')!.crafted).toBe(
      'hunter',
    );
  });
});
