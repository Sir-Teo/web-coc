import { describe, it, expect } from 'vitest';
import { BUILDINGS, buildingHp, maxCountFor, maxLevelFor, upgradeCost } from '../src/game/data';
import { GameModel, initialSave, makeBuilding } from '../src/game/model';
import { validateSave } from '../src/game/save';

describe('Home Village wall progression', () => {
  it('uses each destination price and hitpoint total through the playable eight levels', () => {
    const m = new GameModel();
    m.townhall!.level = 8;
    const wall = makeBuilding(m.state.nextId++, 'wall', 2, 2);
    m.state.buildings.push(wall);
    expect(BUILDINGS.wall.cost).toBe(0);
    expect(wall.hp).toBe(100);
    const prices = [1000, 5000, 10000, 20000, 30000, 50000, 75000];
    const hp = [200, 400, 800, 1200, 1800, 2400, 3000];
    for (let i = 0; i < prices.length; i++) {
      expect(upgradeCost('wall', wall.level)).toBe(prices[i]);
      m.state.gold = prices[i] - 1;
      expect(m.upgradeWalls([wall.id], 'gold')).toBe(false);
      expect(wall.level).toBe(i + 1);
      m.state.gold++;
      expect(m.upgradeWalls([wall.id], 'gold')).toBe(true);
      expect(m.state.gold).toBe(0);
      expect([wall.hp, wall.maxHp, buildingHp('wall', wall.level)]).toEqual(Array(3).fill(hp[i]));
      expect(wall.upgradeEnd).toBeUndefined();
    }
    m.state.gold = 1000000;
    expect(m.upgradeWalls([wall.id], 'gold')).toBe(false);
    expect(wall.level).toBe(8);
  });

  it('charges the sum of mixed destination levels in elixir, skipping capped walls', () => {
    const m = new GameModel();
    m.townhall!.level = 8;
    const walls = [5, 6, 7, 8].map((level, i) =>
      makeBuilding(m.state.nextId++, 'wall', 2 + i, 2, level),
    );
    m.state.buildings.push(...walls);
    const ids = walls.map((b) => b.id);
    expect(m.wallUpgradeQuote(ids, 'elixir').cost).toBe(155000);
    m.state.elixir = 154999;
    expect(m.upgradeWalls(ids, 'elixir')).toBe(false);
    expect(walls.map((b) => b.level)).toEqual([5, 6, 7, 8]);
    m.state.elixir++;
    expect(m.upgradeWalls(ids, 'elixir')).toBe(true);
    expect(m.state.elixir).toBe(0);
    expect(walls.map((b) => b.hp)).toEqual([1800, 2400, 3000, 3000]);
  });

  it('starts within the TH2 limit and places for free with no gold for the final available piece', () => {
    expect(Array.from({ length: 9 }, (_, i) => maxCountFor('wall', i + 1))).toEqual([
      0, 25, 50, 75, 100, 125, 175, 225, 250,
    ]);
    expect(Array.from({ length: 9 }, (_, i) => maxLevelFor('wall', i + 1))).toEqual([
      0, 2, 3, 4, 5, 6, 7, 8, 10,
    ]);
    const m = new GameModel();
    expect(m.countOf('wall')).toBe(25);
    m.state.obstacles = [];
    m.state.buildings.splice(
      m.state.buildings.findIndex((b) => b.kind === 'wall'),
      1,
    );
    m.state.gold = 0;
    m.beginBuild('wall');
    expect(m.place(2, 2)).toBe(true);
    expect(m.state.gold).toBe(0);
    expect(m.countOf('wall')).toBe(25);
    expect(m.placement).toBeNull();
    const placed = m.state.buildings.at(-1)!;
    expect([placed.hp, placed.maxHp]).toEqual([100, 100]);
    expect(placed.upgradeEnd).toBeUndefined();
    m.state.gold = 0;
    m.beginBuild('wall');
    expect(m.placement).toBeNull();
    // A stale armed tool must also respect the limit when the player places it.
    m.placement = 'wall';
    expect(m.place(3, 2)).toBe(false);
    expect(m.state.gold).toBe(0);
  });

  it('retains legacy extras and levels, normalizes health, and uses it in practice battles', () => {
    const save = initialSave();
    save.obstacles = [];
    const extra = makeBuilding(save.nextId++, 'wall', 2, 2, 12);
    extra.maxHp = 1875; // Former generic wall formula.
    extra.hp = 937.5;
    save.buildings.push(extra);
    expect(validateSave(save)).toBe(true);
    const before = save.buildings.map(({ id, x, y, level }) => ({ id, x, y, level }));
    const m = new GameModel(save);
    expect(m.countOf('wall')).toBe(26);
    expect(m.state.buildings.map(({ id, x, y, level }) => ({ id, x, y, level }))).toEqual(before);
    expect([extra.hp, extra.maxHp]).toEqual([3500, 7000]);
    m.beginBuild('wall');
    expect(m.placement).toBeNull();
    m.startBattle(0, true);
    expect(m.battle!.buildings.find((b) => b.id === extra.id)!.hp).toBe(7000);
    expect(extra.hp).toBe(3500);
    m.returnHome();
    const restored = new GameModel(structuredClone(m.state));
    expect(restored.state.buildings.find((b) => b.id === extra.id)!.hp).toBe(3500);
    expect(validateSave(restored.state)).toBe(true);
  });

  it('finishes legacy pending wall upgrades with the destination health and no second charge', () => {
    const m = new GameModel();
    const wall = m.state.buildings.find((b) => b.kind === 'wall')!;
    wall.level = 4;
    wall.maxHp = wall.hp = 875;
    wall.upgradeStart = m.clock;
    wall.upgradeEnd = m.clock + 1000;
    const gold = m.state.gold;
    m.tick(m.clock + 1000);
    expect([wall.level, wall.hp, wall.maxHp]).toEqual([5, 1200, 1200]);
    expect(m.state.gold).toBe(gold);
    expect(wall.upgradeEnd).toBeUndefined();
  });
});

it('reconciles every reduced wall tier at the saved damage fraction without changing the layout', () => {
  const oldHp = [300, 500, 700, 900, 1400, 2000, 2500];
  const currentHp = [100, 200, 400, 800, 1200, 1800, 2400];
  const save = initialSave();
  save.obstacles = [];
  const walls = oldHp.map((hp, i) => ({
    ...makeBuilding(save.nextId++, 'wall', i + 2, 2, i + 1),
    hp: hp / 2,
    maxHp: hp,
  }));
  save.buildings.push(...walls);
  const m = new GameModel(structuredClone(save));
  for (const [i, old] of walls.entries()) {
    const wall = m.state.buildings.find((b) => b.id === old.id)!;
    expect([wall.x, wall.y, wall.level, wall.hp, wall.maxHp]).toEqual([
      old.x,
      old.y,
      old.level,
      currentHp[i] / 2,
      currentHp[i],
    ]);
  }
  m.startBattle(0, true);
  for (const [i, wall] of walls.entries())
    expect(m.battle!.buildings.find((b) => b.id === wall.id)!.hp).toBe(currentHp[i]);
  m.returnHome();
  const reloaded = new GameModel(structuredClone(m.state));
  for (const [i, wall] of walls.entries())
    expect(reloaded.state.buildings.find((b) => b.id === wall.id)!.hp).toBe(currentHp[i] / 2);
  expect(validateSave(reloaded.state)).toBe(true);
});

it('TH5 can fund level 4 to 5 walls and same-level selection with elixir, but lower pieces block a mixed batch', () => {
  const m = new GameModel();
  m.townhall!.level = 5;
  const walls = [
    makeBuilding(m.state.nextId++, 'wall', 2, 2, 4),
    makeBuilding(m.state.nextId++, 'wall', 3, 2, 4),
  ];
  m.state.buildings.push(...walls);
  m.selected = walls[0].id;
  m.state.gold = 0;
  m.state.elixir = 39999;
  expect(m.canAdjustWallSelection(1)).toBe(false);
  m.state.elixir++;
  expect(m.adjustWallSelection(1)).toBe(true);
  expect(m.selectedWalls.map((b) => b.id)).toEqual(walls.map((b) => b.id));
  walls[1].level = 3;
  const ids = walls.map((b) => b.id);
  expect(m.upgradeWalls(ids, 'elixir')).toBe(false);
  expect(m.state.elixir).toBe(40000);
  expect(walls[0].level).toBe(4);
  walls[1].level = 4;
  expect(m.upgradeWalls(ids, 'elixir')).toBe(true);
  expect([m.state.gold, m.state.elixir, m.busy]).toEqual([0, 0, 0]);
  expect(walls.map((b) => [b.level, b.hp, b.upgradeEnd])).toEqual([
    [5, 1200, undefined],
    [5, 1200, undefined],
  ]);
  const restored = new GameModel(structuredClone(m.state));
  expect(restored.state.elixir).toBe(0);
  expect(restored.state.buildings.filter((b) => ids.includes(b.id)).map((b) => b.level)).toEqual([
    5, 5,
  ]);
});
