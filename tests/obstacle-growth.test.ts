import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fundedVillage } from './fixtures/funded-village';
import { GameModel, initialSave, makeBuilding } from '../src/game/model';
import { validateSave } from '../src/game/save';
import {
  advanceObstacles,
  OBSTACLE_GROWTH_INTERVAL as INTERVAL,
  OBSTACLE_LIMIT,
  treeGrowthSites,
  type Obstacle,
} from '../src/game/obstacles';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-11T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());
function village() {
  const m = fundedVillage();
  m.state.obstacleGrowth!.seed = 1234;
  return m;
}
function fullField(): Obstacle[] {
  return Array.from({ length: 45 }, (_, i) => ({
    id: i + 1,
    kind: 'rocks',
    x: (i % 9) * 3,
    y: Math.floor(i / 9) * 3,
  }));
}

describe('recurring village vegetation', () => {
  it('grows a tree exactly at eight hours with a full tile between every occupied footprint', () => {
    const m = village();
    const before = structuredClone(m.obstacles);
    const due = m.state.obstacleGrowth!.nextAt;
    const sites = treeGrowthSites(m.state.buildings, before);
    m.tick(due - 1);
    expect(m.obstacles).toEqual(before);
    m.tick(due);
    const tree = m.obstacles.at(-1)!;
    expect(m.obstacles).toHaveLength(before.length + 1);
    expect(tree.kind).toBe('trees');
    expect(sites).toContainEqual({ x: tree.x, y: tree.y });
    for (const site of sites) {
      for (const o of before) {
        expect(
          site.x + 3 <= o.x || site.x >= o.x + 3 || site.y + 3 <= o.y || site.y >= o.y + 3,
        ).toBe(true);
      }
    }
    expect(m.state.obstacleGrowth!.nextAt).toBe(due + INTERVAL);
    expect(validateSave(m.state)).toBe(true);
    m.tick(due); // Repeated ticks cannot duplicate an opportunity.
    expect(m.obstacles).toHaveLength(before.length + 1);
  });

  it('uses the buffer for growth without preventing adjacent construction', () => {
    const wall = makeBuilding(1, 'wall', 4, 4);
    const sites = treeGrowthSites([wall], []);
    expect(sites).not.toContainEqual({ x: 2, y: 4 });
    expect(sites).not.toContainEqual({ x: 3, y: 2 }); // Diagonal buffer.
    expect(sites).toContainEqual({ x: 1, y: 4 });
    expect(sites).toContainEqual({ x: 6, y: 4 });
    expect(sites).toContainEqual({ x: 0, y: 0 }); // Map edges need no exterior tile.
    const m = village();
    m.state.buildings = [];
    m.state.obstacles = [{ id: 1, kind: 'trees', x: 4, y: 4 }];
    expect(m.canPlace('wall', 3, 4)).toBe(true);
    expect(m.canPlace('wall', 4, 4)).toBe(false);
  });

  it('matches incremental ticks after a long offline absence, including reloads and the cap', () => {
    const online = village();
    const offlineSave = structuredClone(online.state);
    const start = online.clock;
    for (let i = 1; i <= 150; i++) online.tick(start + i * INTERVAL);
    vi.setSystemTime(start + 150 * INTERVAL);
    const offline = new GameModel(offlineSave);
    expect(offline.obstacles).toEqual(online.obstacles);
    expect(offline.state.obstacleGrowth).toEqual(online.state.obstacleGrowth);
    expect(offline.obstacles.length).toBeLessThanOrEqual(OBSTACLE_LIMIT);
    expect(offline.obstacles.filter((o) => o.kind === 'rocks')).toHaveLength(3);
    expect(validateSave(offline.state)).toBe(true);
    const reloaded = new GameModel(structuredClone(offline.state));
    expect(reloaded.obstacles).toEqual(offline.obstacles);
    expect(reloaded.state.obstacleGrowth).toEqual(offline.state.obstacleGrowth);
  });

  it('settles removal after earlier capped opportunities, then grows at the next opportunity', () => {
    const obstacles = fullField();
    const growth = { nextAt: INTERVAL, seed: 77, nextId: 46 };
    obstacles[0].removeEnd = INTERVAL + 10000;
    obstacles[0].removeStart = INTERVAL;
    const incremental = structuredClone({ obstacles, growth });
    advanceObstacles(incremental.obstacles, [], incremental.growth, INTERVAL);
    const events = advanceObstacles(obstacles, [], growth, INTERVAL + 10000);
    advanceObstacles(incremental.obstacles, [], incremental.growth, INTERVAL + 10000);
    expect(events.grown).toHaveLength(0);
    expect(events.removed.map((o) => o.id)).toEqual([1]);
    expect(obstacles).toHaveLength(44);
    expect(growth.seed).toBe(77);
    expect(growth.nextAt).toBe(INTERVAL * 2);
    expect({ obstacles, growth }).toEqual(incremental);
    advanceObstacles(obstacles, [], growth, INTERVAL * 2);
    expect(obstacles).toHaveLength(45);
    expect(obstacles.at(-1)!.id).toBe(46);
    expect(obstacles.at(-1)!.kind).toBe('trees');
  });

  it('completes simultaneous removals by ID before growth at the same instant', () => {
    const obstacles = fullField().reverse();
    for (const o of obstacles.filter((o) => o.id <= 2)) {
      o.removeStart = INTERVAL - 10000;
      o.removeEnd = INTERVAL;
    }
    const growth = { nextAt: INTERVAL, seed: 77, nextId: 46 };
    const events = advanceObstacles(obstacles, [], growth, INTERVAL);
    expect(events.removed.map((o) => o.id)).toEqual([1, 2]);
    expect(events.grown).toHaveLength(1);
    expect(obstacles).toHaveLength(44);
  });

  it('skips years of blocked growth without banking spawns or consuming the random sequence', () => {
    const buildings = Array.from({ length: 256 }, (_, i) =>
      makeBuilding(i + 1, 'wall', (i % 16) * 3, Math.floor(i / 16) * 3),
    );
    expect(treeGrowthSites(buildings, [])).toEqual([]);
    const obstacles: Obstacle[] = [];
    const growth = { nextAt: INTERVAL, seed: 77, nextId: 1 };
    const now = INTERVAL * 1000000 + 99;
    advanceObstacles(obstacles, buildings, growth, now);
    expect(obstacles).toEqual([]);
    expect(growth).toEqual({ nextAt: INTERVAL * 1000001, seed: 77, nextId: 1 });
    advanceObstacles(obstacles, [], growth, now + 1);
    expect(obstacles).toEqual([]);
    advanceObstacles(obstacles, [], growth, growth.nextAt);
    expect(obstacles).toHaveLength(1);
  });

  it('keeps IDs unique after clearing the most recent tree and reloading', () => {
    let m = village();
    m.tick(m.state.obstacleGrowth!.nextAt);
    const tree = m.obstacles.at(-1)!;
    m.removeObstacle(tree.id);
    m.tick(tree.removeEnd!);
    vi.setSystemTime(m.clock);
    m = new GameModel(structuredClone(m.state));
    m.tick(m.state.obstacleGrowth!.nextAt);
    expect(m.obstacles.at(-1)!.id).toBeGreaterThan(tree.id);
    expect(validateSave(m.state)).toBe(true);
  });

  it('initializes legacy and imported saves once without adding retroactive trees', () => {
    const old = initialSave();
    old.obstacles = [];
    old.lastTick -= 30 * 24 * 3600000;
    const m = new GameModel(old);
    expect(m.obstacles).toEqual([]);
    expect(m.state.obstacleGrowth!.nextAt).toBe(Date.now() + INTERVAL);
    m.state = initialSave(); // The backup import path replaces state on an existing model.
    delete m.state.obstacles;
    m.tick(Date.now());
    expect(m.obstacles).toHaveLength(8);
    expect(validateSave(m.state)).toBe(true);
    const schedule = structuredClone(m.state.obstacleGrowth);
    m.tick(Date.now() - 10000);
    expect(m.state.obstacleGrowth).toEqual(schedule);
  });

  it('rejects corrupt schedules, reused IDs, and unsafe obstacle IDs', () => {
    const m = village();
    for (const patch of [
      { nextAt: Infinity },
      { nextAt: -1 },
      { nextAt: 1.5 },
      { seed: -1 },
      { seed: 0x100000000 },
      { seed: 1.5 },
      { nextId: 8 },
      { nextId: 0 },
      { nextId: Number.MAX_SAFE_INTEGER + 1 },
    ]) {
      const s = structuredClone(m.state);
      Object.assign(s.obstacleGrowth!, patch);
      expect(validateSave(s)).toBe(false);
    }
    const s = structuredClone(m.state);
    s.obstacles![0].id = Number.MAX_SAFE_INTEGER;
    delete s.obstacleGrowth;
    expect(validateSave(s)).toBe(false);
  });

  it('preserves undo and redo history when new trees occupy saved positions', () => {
    const m = village();
    const b = makeBuilding(1, 'cannon', 2, 2);
    m.state.buildings = [b];
    m.state.obstacles = [];
    m.beginEdit();
    m.saveLayout(0);
    expect(m.dragTo(b.id, 8, 8)).toBe(true);
    m.state.obstacles.push({ id: 20, kind: 'trees', x: 2, y: 2 });
    m.undo();
    m.loadLayout(0);
    expect([b.x, b.y]).toEqual([8, 8]);
    expect(m.canUndo).toBe(true);
    expect(m.canRedo).toBe(false);
    m.state.obstacles = [];
    m.undo();
    expect([b.x, b.y]).toEqual([2, 2]);
    m.state.obstacles.push({ id: 21, kind: 'trees', x: 8, y: 8 });
    m.redo();
    expect([b.x, b.y]).toEqual([2, 2]);
    expect(m.canRedo).toBe(true);
    m.state.obstacles = [];
    m.redo();
    expect([b.x, b.y]).toEqual([8, 8]);
  });
});
