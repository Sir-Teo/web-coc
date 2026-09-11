import { MAP_SIZE, gridSize, footprintSize, SAVE_VERSION, type GridVersion } from './grid';
import { BUILDINGS } from './data';
import type { Building } from './model';

// Regular-obstacle reward cycle; provenance and tutorial differences: docs/OBSTACLES.md.
export const OBSTACLE_GEMS = [6, 0, 4, 5, 1, 3, 2, 0, 0, 5, 1, 0, 3, 4, 0, 0, 5, 0, 1, 0] as const;

export const OBSTACLES = {
  trees: { name: 'Tree', size: 2, width: 135, resource: 'elixir', cost: 2000, seconds: 10 },
  rocks: { name: 'Rock', size: 2, width: 82, resource: 'gold', cost: 500, seconds: 10 },
} as const;
export interface Obstacle {
  id: number;
  kind: keyof typeof OBSTACLES;
  x: number;
  y: number;
  removeStart?: number;
  removeEnd?: number;
}
export function overlapsObstacle(
  obstacles: readonly Obstacle[],
  x: number,
  y: number,
  size: number,
) {
  return obstacles.some(
    (o) =>
      x < o.x + OBSTACLES[o.kind].size &&
      x + size > o.x &&
      y < o.y + OBSTACLES[o.kind].size &&
      y + size > o.y,
  );
}
export function initialObstacles(buildings: readonly Building[]): Obstacle[] {
  return (
    [
      ['trees', 2, 2],
      ['trees', 0, 12],
      ['trees', 22, 3],
      ['trees', 24, 23],
      ['trees', 2, 24],
      ['rocks', 1, 17],
      ['rocks', 22, 1],
      ['rocks', 23, 19],
    ] as const
  )
    .map(([kind, x, y], i) => ({ id: i + 1, kind, x, y }))
    .filter((o) => !buildings.some((b) => overlapsObstacle([o], b.x, b.y, BUILDINGS[b.kind].size)));
}
export function validObstacles(
  value: unknown,
  buildings: readonly Building[],
  version: GridVersion = SAVE_VERSION,
): value is Obstacle[] {
  if (!Array.isArray(value) || value.length > OBSTACLE_LIMIT) return false;
  const ids = new Set<number>();
  for (const o of value) {
    if (
      !o ||
      !Object.hasOwn(OBSTACLES, o.kind) ||
      !Number.isSafeInteger(o.id) ||
      o.id < 1 ||
      o.id >= Number.MAX_SAFE_INTEGER ||
      ids.has(o.id) ||
      !Number.isInteger(o.x) ||
      !Number.isInteger(o.y) ||
      o.x < 0 ||
      o.y < 0 ||
      o.x + 2 > gridSize(version) ||
      o.y + 2 > gridSize(version)
    )
      return false;
    if (o.removeEnd !== undefined || o.removeStart !== undefined) {
      if (
        !Number.isFinite(o.removeStart) ||
        !Number.isFinite(o.removeEnd) ||
        o.removeStart < 0 ||
        o.removeEnd <= o.removeStart ||
        o.removeEnd - o.removeStart > OBSTACLES[o.kind as Obstacle['kind']].seconds * 1000
      )
        return false;
    }
    if (buildings.some((b) => overlapsObstacle([o], b.x, b.y, footprintSize(b.kind, BUILDINGS[b.kind].size, version))))
      return false;
    if (
      overlapsObstacle(
        value.filter((other) => other !== o && ids.has(other?.id)),
        o.x,
        o.y,
        2,
      )
    )
      return false;
    ids.add(o.id);
  }
  return true;
}

export const OBSTACLE_GROWTH_INTERVAL = 8 * 3600000;
export const OBSTACLE_LIMIT = 45;
export interface ObstacleGrowth {
  nextAt: number;
  seed: number;
  nextId: number;
}

export function initialObstacleGrowth(obstacles: readonly Obstacle[], now: number): ObstacleGrowth {
  return {
    nextAt: Math.floor(now) + OBSTACLE_GROWTH_INTERVAL,
    seed: Math.floor(Math.random() * 0x100000000),
    nextId: Math.max(0, ...obstacles.map((o) => o.id)) + 1,
  };
}

export function validObstacleGrowth(
  value: unknown,
  obstacles: readonly Obstacle[],
): value is ObstacleGrowth {
  if (!value || typeof value !== 'object') return false;
  const g = value as ObstacleGrowth;
  return (
    Number.isSafeInteger(g.nextAt) &&
    g.nextAt > 0 &&
    g.nextAt <= Number.MAX_SAFE_INTEGER - OBSTACLE_GROWTH_INTERVAL &&
    Number.isInteger(g.seed) &&
    g.seed >= 0 &&
    g.seed <= 0xffffffff &&
    Number.isSafeInteger(g.nextId) &&
    g.nextId > 0 &&
    obstacles.every((o) => o.id < g.nextId)
  );
}

/** The buffer is for natural growth only; players may build beside existing trees. */
export function treeGrowthSites(buildings: readonly Building[], obstacles: readonly Obstacle[]) {
  const occupied = [
    ...buildings.map((b) => ({ x: b.x, y: b.y, size: BUILDINGS[b.kind].size })),
    ...obstacles.map((o) => ({ x: o.x, y: o.y, size: OBSTACLES[o.kind].size })),
  ];
  const sites: { x: number; y: number }[] = [];
  for (let y = 0; y <= MAP_SIZE - 2; y++) {
    for (let x = 0; x <= MAP_SIZE - 2; x++) {
      if (
        !occupied.some(
          (o) => x < o.x + o.size + 1 && x + 3 > o.x && y < o.y + o.size + 1 && y + 3 > o.y,
        )
      )
        sites.push({ x, y });
    }
  }
  return sites;
}

/** Settle home events in time order. Blocked intervals skip in O(1), even after years offline. */
export function advanceObstacles(
  obstacles: Obstacle[],
  buildings: readonly Building[],
  growth: ObstacleGrowth,
  now: number,
) {
  const removed: Obstacle[] = [];
  const grown: Obstacle[] = [];
  const growUntil = (until: number, inclusive: boolean) => {
    while (inclusive ? growth.nextAt <= until : growth.nextAt < until) {
      const sites =
        obstacles.length < OBSTACLE_LIMIT && growth.nextId < Number.MAX_SAFE_INTEGER
          ? treeGrowthSites(buildings, obstacles)
          : [];
      if (!sites.length) {
        const intervals = (until - growth.nextAt) / OBSTACLE_GROWTH_INTERVAL;
        growth.nextAt +=
          (inclusive ? Math.floor(intervals) + 1 : Math.ceil(intervals)) * OBSTACLE_GROWTH_INTERVAL;
        return;
      }
      // A persisted local PRNG keeps reloads and differently sized ticks equivalent.
      // This is not a claim to reproduce Supercell's private spawn algorithm.
      growth.seed = (Math.imul(growth.seed, 1664525) + 1013904223) >>> 0;
      const site = sites[Math.floor((growth.seed / 0x100000000) * sites.length)];
      const tree: Obstacle = { id: growth.nextId++, kind: 'trees', ...site };
      obstacles.push(tree);
      grown.push(tree);
      growth.nextAt += OBSTACLE_GROWTH_INTERVAL;
    }
  };
  const completions = obstacles
    .filter((o) => o.removeEnd !== undefined && o.removeEnd <= now)
    .sort((a, b) => a.removeEnd! - b.removeEnd! || a.id - b.id);
  for (const o of completions) {
    growUntil(o.removeEnd!, false);
    obstacles.splice(obstacles.indexOf(o), 1);
    removed.push(o);
  }
  // Removals win ties, freeing their footprint for an opportunity at the same instant.
  growUntil(now, true);
  return { removed, grown };
}
