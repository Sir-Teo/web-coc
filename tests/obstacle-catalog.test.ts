import { describe, expect, it } from 'vitest';
import catalog from '../reference/obstacles/catalog.json' with { type: 'json' };
import { GameModel, initialSave, makeBuilding } from '../src/game/model';
import { validateSave } from '../src/game/save';
import { MAP_SIZE } from '../src/game/grid';
import {
  advanceObstacles,
  GEM_BOX,
  GEM_BOX_MIN_RESPAWN,
  GEM_BOX_PERIOD,
  OBSTACLES,
  OBSTACLE_GEMS,
  OBSTACLE_GROWTH_INTERVAL,
  REGROWTH,
  treeGrowthSites,
  validObstacles,
  type Obstacle,
  type ObstacleGrowth,
} from '../src/game/obstacles';

const HOUR = 3_600_000;

describe('client obstacle catalog', () => {
  it('reads the regrowing kinds, starting stones and Gem Box from the client', () => {
    expect(REGROWTH).toEqual([
      { kind: 'pine-tree', weight: 20, size: 2 },
      { kind: 'square-bush', weight: 20, size: 2 },
      { kind: 'square-tree', weight: 5, size: 3 },
      { kind: 'square-tree-2', weight: 5, size: 3 },
      { kind: 'tree-trunk-1', weight: 10, size: 2 },
      { kind: 'tree-trunk-2', weight: 10, size: 2 },
      { kind: 'mushrooms', weight: 10, size: 2 },
      { kind: 'fallen-tree', weight: 20, size: 2 },
    ]);
    expect(OBSTACLES['pine-tree']).toMatchObject({ resource: 'elixir', cost: 2000, seconds: 10 });
    expect(OBSTACLES['large-stone']).toMatchObject({ resource: 'gold', cost: 20000, size: 3 });
    expect(OBSTACLES['sharp-stone-1'].loot).toBeUndefined();
    expect(OBSTACLES[GEM_BOX]).toMatchObject({
      name: 'Gem Box',
      resource: 'elixir',
      cost: 1000,
      seconds: 30,
      loot: 'gems',
      lootCount: 25,
    });
    expect(GEM_BOX_PERIOD).toBe(168 * HOUR);
    expect(GEM_BOX_MIN_RESPAWN).toBe(24 * HOUR);
    // Older saves' keys name the same rows.
    expect(OBSTACLES.trees).toBe(OBSTACLES['pine-tree']);
    expect(OBSTACLES.rocks).toBe(OBSTACLES['small-stone-1']);
    expect(catalog.obstacles).toHaveLength(21);
  });

  it('regrows each kind by its weight and fits the 3×3 trees with their buffer', () => {
    const counts: Record<string, number> = {};
    for (let seed = 1; seed <= 4000; seed++) {
      const obstacles: Obstacle[] = [];
      // Spread seeds: consecutive small ones give correlated first draws from the LCG.
      advanceObstacles(
        obstacles,
        [],
        { nextAt: 1, seed: Math.imul(seed, 0x9e3779b1) >>> 0, nextId: 1 },
        1,
      );
      counts[obstacles[0].kind] = (counts[obstacles[0].kind] ?? 0) + 1;
    }
    for (const { kind, weight } of REGROWTH)
      expect(Math.abs(counts[kind] / 4000 - weight / 100)).toBeLessThan(0.03);
    // A field with room for 2×2 growth only (its corner blocks) never grows a 3×3 tree.
    const walls = [];
    for (let x = 0; x < MAP_SIZE; x++)
      for (let y = 0; y < MAP_SIZE; y++)
        if (x % 4 === 3 || y % 4 === 3) walls.push(makeBuilding(walls.length + 1, 'wall', x, y));
    expect(treeGrowthSites(walls, [], 3)).toEqual([]);
    expect(treeGrowthSites(walls, [], 2)).toEqual([{ x: 0, y: 0 }]);
    const grown: Obstacle[] = [];
    advanceObstacles(
      grown,
      walls,
      { nextAt: 1, seed: 9, nextId: 1 },
      1 + 30 * OBSTACLE_GROWTH_INTERVAL,
    );
    expect(grown.map((o) => OBSTACLES[o.kind].size)).toEqual([2]);
  });

  it('places a weekly Gem Box that pays 25 gems and returns a day after clearing at the soonest', () => {
    const m = new GameModel(initialSave());
    m.state.obstacles = [];
    const growth = m.state.obstacleGrowth!;
    growth.nextAt = Number.MAX_SAFE_INTEGER - 2 * OBSTACLE_GROWTH_INTERVAL; // Isolate the Gem Box.
    const due = growth.gemBoxAt!;
    m.tick(due - 1);
    expect(m.obstacles.some((o) => o.kind === GEM_BOX)).toBe(false);
    m.tick(due);
    const box = m.obstacles.find((o) => o.kind === GEM_BOX)!;
    expect(box).toBeDefined();
    expect(growth.gemBoxAt).toBe(due + GEM_BOX_PERIOD);
    // One at a time: the next appearance waits while this one stands.
    m.tick(due + GEM_BOX_PERIOD);
    expect(m.obstacles.filter((o) => o.kind === GEM_BOX)).toHaveLength(1);
    expect(growth.gemBoxAt).toBe(due + 2 * GEM_BOX_PERIOD);
    m.state.elixir = 5000;
    const gems = m.state.gems,
      cycle = m.state.obstacleGemIndex;
    expect(m.removeObstacle(box.id)).toBe(true);
    expect(m.state.elixir).toBe(4000);
    const cleared = box.removeEnd!;
    expect(cleared - box.removeStart!).toBe(30_000);
    m.tick(cleared);
    expect(m.state.gems).toBe(gems + 25);
    expect(m.state.obstacleGemIndex).toBe(cycle);
    expect(growth.gemBoxAt).toBe(Math.max(due + 2 * GEM_BOX_PERIOD, cleared + GEM_BOX_MIN_RESPAWN));
    expect(validateSave(JSON.parse(JSON.stringify(m.state)))).toBe(true);
  });

  it('pays nothing for a Sharp Stone and leaves the gem cycle where it was', () => {
    const m = new GameModel(initialSave());
    m.state.obstacles = [{ id: 500, kind: 'sharp-stone-1', x: 30, y: 30 }];
    m.state.gold = 20_000;
    const gems = m.state.gems,
      cycle = m.state.obstacleGemIndex;
    expect(m.removeObstacle(500)).toBe(true);
    m.tick(m.obstacles[0].removeEnd!);
    expect(m.state.gems).toBe(gems);
    expect(m.state.obstacleGemIndex).toBe(cycle);
    expect(OBSTACLE_GEMS[cycle!]).toBe(6);
  });

  it('schedules a Gem Box for saves from before it, and validates footprints by kind', () => {
    const save = structuredClone(initialSave());
    const m = new GameModel(save);
    delete (m.state.obstacleGrowth as Partial<ObstacleGrowth>).gemBoxAt;
    const loaded = new GameModel(JSON.parse(JSON.stringify(m.state)));
    expect(loaded.state.obstacleGrowth!.gemBoxAt).toBe(Math.floor(loaded.clock) + GEM_BOX_PERIOD);
    // A 3×3 tree needs three tiles of room at the edge.
    expect(validObstacles([{ id: 1, kind: 'square-tree', x: MAP_SIZE - 3, y: 0 }], [])).toBe(true);
    expect(validObstacles([{ id: 1, kind: 'square-tree', x: MAP_SIZE - 2, y: 0 }], [])).toBe(false);
    expect(validObstacles([{ id: 1, kind: 'not-an-obstacle', x: 1, y: 1 }], [])).toBe(false);
  });
});
