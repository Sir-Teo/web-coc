import { describe, it, expect } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { wallRow, matchingWalls } from '../src/game/wall-selection';
import { validateSave } from '../src/game/save';

function village() {
  const m = new GameModel();
  m.townhall!.level = 8;
  m.state.gold = m.state.elixir = 200000;
  return m;
}

describe('wall selection and instant upgrades', () => {
  it('selects straight contiguous rows across mixed levels without following corners or gaps', () => {
    const walls = [
      makeBuilding(1, 'wall', 4, 4, 2),
      makeBuilding(2, 'wall', 5, 4, 3),
      makeBuilding(3, 'wall', 6, 4, 5),
      makeBuilding(4, 'wall', 6, 5),
      makeBuilding(5, 'wall', 8, 4),
      makeBuilding(6, 'cannon', 3, 4),
    ];
    expect(wallRow(walls, 2, 'x').map((b) => b.id)).toEqual([1, 2, 3]);
    expect(wallRow(walls, 3, 'y').map((b) => b.id)).toEqual([3, 4]);
    expect(wallRow(walls, 6, 'x')).toEqual([]);
    expect(wallRow(walls, 99, 'x')).toEqual([]);
  });

  it('chooses matching walls by distance and stable ID, with the anchor retained first', () => {
    const walls = [
      makeBuilding(7, 'wall', 4, 4, 2),
      makeBuilding(3, 'wall', 3, 4, 2),
      makeBuilding(2, 'wall', 5, 4, 2),
      makeBuilding(4, 'wall', 6, 4, 3),
    ];
    expect(matchingWalls(walls, 7).map((b) => b.id)).toEqual([7, 2, 3]);
    expect(matchingWalls([...walls].reverse(), 7)).toEqual(matchingWalls(walls, 7));
    walls[1].constructing = true;
    expect(matchingWalls(walls, 7).map((b) => b.id)).toEqual([7, 2]);
  });

  it('adds and removes 1 or 10 walls, respects the available budget and clears stale selections', () => {
    const m = village();
    const anchor = m.state.buildings.find((b) => b.kind === 'wall')!;
    m.selected = anchor.id;
    expect(m.adjustWallSelection(10)).toBe(true);
    expect(m.selectedWalls).toHaveLength(11);
    expect(m.selectedWalls).toContain(anchor);
    expect(m.adjustWallSelection(-10)).toBe(true);
    expect(m.adjustWallSelection(-1)).toBe(false);
    m.state.gold = m.upgradeCost(anchor);
    m.state.elixir = 200000; // Low-level walls cannot use elixir.
    expect(m.adjustWallSelection(1)).toBe(false);
    m.state.gold *= 2;
    expect(m.adjustWallSelection(1)).toBe(true);
    expect(m.adjustWallSelection(2)).toBe(false);
    m.selected = m.townhall!.id;
    m.selected = anchor.id;
    expect(m.selectedWalls.map((b) => b.id)).toEqual([anchor.id]);
    m.beginEdit();
    expect(m.selectedWalls).toEqual([]);
  });

  it('charges a whole mixed row once, upgrades eligible pieces, and persists without a timer', () => {
    const m = village();
    const walls = m.state.buildings.filter((b) => b.kind === 'wall').slice(0, 3);
    walls[0].level = 5;
    walls[1].level = 6;
    walls[2].level = 8;
    m.selected = walls[0].id;
    const ids = walls.map((b) => b.id);
    const quote = m.wallUpgradeQuote(ids, 'elixir');
    expect(quote.walls).toHaveLength(2);
    expect(quote.skipped).toBe(1);
    const funds = m.state.elixir,
      gold = m.state.gold,
      busy = m.busy;
    const effects: unknown[] = [];
    m.onEffect = (fx) => effects.push(fx);
    expect(m.upgradeWalls(ids, 'elixir')).toBe(true);
    expect(m.state.elixir).toBe(funds - quote.cost);
    expect(m.state.gold).toBe(gold);
    expect(walls.map((b) => b.level)).toEqual([6, 7, 8]);
    expect(walls.every((b) => !b.upgradeEnd && !b.upgradeStart && b.hp === b.maxHp)).toBe(true);
    expect(m.busy).toBe(busy);
    expect(effects).toHaveLength(1);
    const restored = new GameModel(structuredClone(m.state));
    expect(restored.state.elixir).toBe(funds - quote.cost);
    expect(restored.state.buildings.filter((b) => ids.includes(b.id)).map((b) => b.level)).toEqual([
      6, 7, 8,
    ]);
    expect(validateSave(restored.state)).toBe(true);
  });

  it('rejects unaffordable, invalid, in-progress and battle-time batches without partial charges', () => {
    const m = village();
    const walls = m.state.buildings.filter((b) => b.kind === 'wall').slice(0, 3);
    const ids = walls.map((b) => b.id);
    m.state.gold = m.upgradeCost(walls[0]);
    let before = structuredClone(m.state);
    expect(m.upgradeWalls(ids, 'gold')).toBe(false);
    expect(m.upgradeWalls([ids[0], ids[0]], 'gold')).toBe(false);
    expect(m.upgradeWalls([ids[0], m.townhall!.id], 'gold')).toBe(false);
    expect(m.upgradeWalls([ids[0], 999999], 'gold')).toBe(false);
    expect(m.upgradeWalls(ids, 'elixir')).toBe(false);
    expect(m.state).toEqual(before);
    walls[0].upgradeStart = m.clock;
    walls[0].upgradeEnd = m.clock + 10000;
    expect(m.upgradeWalls([ids[0]], 'gold')).toBe(false);
    m.startBattle(0);
    before = structuredClone(m.state);
    expect(m.upgradeWalls([ids[1]], 'gold')).toBe(false);
    m.upgrade(ids[1]);
    expect(m.state).toEqual(before);
  });

  it('requires one available builder for resource upgrades and new walls but never reserves it', () => {
    const m = village();
    m.state.obstacles = [];
    const wall = m.state.buildings.find((b) => b.kind === 'wall')!;
    const level = wall.level;
    const reserved = m.state.buildings.filter((b) => b.kind === 'cannon');
    for (const b of reserved) b.upgradeEnd = m.clock + 60000;
    expect(m.busy).toBe(m.builders);
    expect(m.upgradeWalls([wall.id], 'gold')).toBe(false);
    m.beginBuild('wall');
    expect(m.placement).toBeNull();
    m.placement = 'wall';
    expect(m.place(2, 2)).toBe(false);
    delete reserved[0].upgradeEnd;
    m.upgrade(wall.id);
    expect(wall.level).toBe(level + 1);
    expect(wall.upgradeEnd).toBeUndefined();
    expect(m.busy).toBe(1);
    expect(m.place(2, 2)).toBe(true);
    expect(m.place(3, 2)).toBe(true);
    expect(m.busy).toBe(1);
    expect(validateSave(m.state)).toBe(true);
  });

  it('honors Town Hall ceilings and keeps row selection until a new object or mode is selected', () => {
    const m = village();
    const anchor = m.state.buildings.find((b) => b.kind === 'wall' && b.x === 11 && b.y === 19)!;
    m.selected = anchor.id;
    expect(m.selectWallRow()).toBe(true);
    expect(m.selectedWalls.length).toBeGreaterThan(1);
    expect(m.adjustWallSelection(1)).toBe(false);
    const ids = m.selectedWalls.map((b) => b.id);
    expect(m.upgradeWalls(ids, 'gold')).toBe(true);
    expect(m.selectedWalls.map((b) => b.id)).toEqual(ids);
    m.selectSingleWall();
    expect(m.selectedWalls).toHaveLength(1);
    m.townhall!.level = 2;
    expect(m.upgradeWalls([anchor.id], 'gold')).toBe(false);
    m.startBattle(0);
    expect(m.selectedWalls).toEqual([]);
    expect(m.selectWallRow()).toBe(false);
    m.returnHome();
    expect(m.selectedWalls).toEqual([]);
  });
});
