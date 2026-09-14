import { BUILDINGS, isTrap } from './data';
import { distance2D } from './distance';
import { MAP_SIZE } from './grid';
import type { Building } from './model';

/**
 * Client sub-tile collision for version-44 native campaign battles.
 *
 * The pathfinder in the public client reconstruction (bns34/Supercell.Magic-my-turn @52c5953,
 * `LogicTileMap.IsPassablePathFinder`, `LogicTile.RefreshSubTiles`,
 * `LogicBuilding.PassableSubtilesAtEdge`) splits every tile into 2×2 sub-tiles. A building
 * blocks its footprint except `max(1, Width − BuildingW)` sub-tiles along each edge, so adjacent
 * buildings leave a walkable lane between them. Width-1 objects block their whole tile; in this
 * engine walls stay passable at a breaking cost, exactly as on the legacy tile grid.
 */
export const SUBTILES = 2;
const SIZE = MAP_SIZE * SUBTILES;
const CELLS = SIZE * SIZE;

/** `LogicBuilding.PassableSubtilesAtEdge`; every native campaign building except the cave uses 1. */
export function passableSubtilesAtEdge(b: Pick<Building, 'kind' | 'npc'>) {
  if (b.kind === 'wall') return 0;
  return b.npc === 'foreboding-cave' ? 2 : 1;
}

const blocked = new Uint8Array(CELLS),
  wall = new Uint8Array(CELLS);
/** Rebuild collision for the living, non-trap buildings the caller knows about. */
function occupy(buildings: readonly Building[]) {
  blocked.fill(0);
  wall.fill(0);
  for (const b of buildings) {
    if (b.hp <= 0 || isTrap(b.kind)) continue;
    const size = BUILDINGS[b.kind].size * SUBTILES;
    const edge = size === SUBTILES ? 0 : passableSubtilesAtEdge(b);
    const target = b.kind === 'wall' ? wall : blocked;
    for (let y = b.y * SUBTILES + edge; y < b.y * SUBTILES + size - edge; y++)
      for (let x = b.x * SUBTILES + edge; x < b.x * SUBTILES + size - edge; x++)
        target[y * SIZE + x] = 1;
  }
}

/** Point collision for ground movement (crowd separation, pushback, vortex pulls). */
export function subtileSolid(buildings: readonly Building[]) {
  const solid = new Set<number>();
  for (const b of buildings) {
    if (b.hp <= 0 || isTrap(b.kind)) continue;
    const size = BUILDINGS[b.kind].size * SUBTILES;
    const edge = size === SUBTILES ? 0 : passableSubtilesAtEdge(b);
    for (let y = b.y * SUBTILES + edge; y < b.y * SUBTILES + size - edge; y++)
      for (let x = b.x * SUBTILES + edge; x < b.x * SUBTILES + size - edge; x++)
        solid.add(y * SIZE + x);
  }
  return (x: number, y: number) =>
    solid.has(Math.floor(y * SUBTILES) * SIZE + Math.floor(x * SUBTILES));
}

// Reused search buffers: pathfinding is synchronous and each call resets what it reads.
const cost = new Float64Array(CELLS),
  prev = new Int32Array(CELLS),
  closed = new Uint8Array(CELLS),
  priority = new Float64Array(CELLS),
  heuristic = new Float64Array(CELLS),
  order = new Uint32Array(CELLS),
  position = new Int32Array(CELLS);

const distanceTo = (u: { x: number; y: number }, b: Building | { x: number; y: number }) => {
  const s = 'level' in b ? BUILDINGS[b.kind].size : 0;
  return distance2D(Math.max(b.x - u.x, 0, u.x - b.x - s), Math.max(b.y - u.y, 0, u.y - b.y - s));
};

/** `LogicPathFinderNew.IsLineOfSightClearImpl`: a 4-connected sub-tile walk; walls collide. */
function sightLine(xA: number, yA: number, xB: number, yB: number) {
  const directionX = xB > xA ? 1 : -1,
    directionY = yB > yA ? 1 : -1,
    distanceX = Math.abs(xB - xA),
    distanceY = Math.abs(yB - yA);
  let direction = distanceX - distanceY;
  for (let i = distanceX + distanceY, x = xA, y = yA; i >= 0; i--) {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE || blocked[y * SIZE + x] || wall[y * SIZE + x])
      return false;
    if (direction > 0) {
      direction -= distanceY * 2;
      x += directionX;
    } else {
      direction += distanceX * 2;
      y += directionY;
    }
  }
  return true;
}

/** `LogicPathFinderNew.IsLineOfSightClear`: the sight line and both lines one sub-tile over. */
function lineOfSight(xA: number, yA: number, xB: number, yB: number) {
  const directionX = Math.sign(xB - xA),
    directionY = Math.sign(yB - yA);
  return (
    sightLine(xA, yA, xB, yB) &&
    sightLine(xA + directionX, yA, xB, yB - directionY) &&
    sightLine(xA, yA + directionY, xB - directionX, yB)
  );
}

/**
 * The legacy A* (stable heap, first-in ties, wall break-through cost, in-range goal and short
 * melee approach) on sub-tiles. Costs stay in tile units: a step is half a tile and crossing a
 * wall tile costs the same seven tiles as before. When the client's sight-line test between the
 * start and goal sub-tiles is clear, the route is the goal point alone.
 */
export function findSubtilePath(
  start: { x: number; y: number },
  target: Building | { x: number; y: number },
  buildings: readonly Building[],
  range: number,
): { x: number; y: number }[] {
  occupy(buildings);
  const sx = Math.max(0, Math.min(SIZE - 1, Math.floor(start.x * SUBTILES))),
    sy = Math.max(0, Math.min(SIZE - 1, Math.floor(start.y * SUBTILES))),
    first = sy * SIZE + sx;
  cost.fill(Infinity);
  prev.fill(-1);
  closed.fill(0);
  heuristic.fill(NaN);
  position.fill(-1);
  const open: number[] = [];
  let sequence = 0;
  const center = (node: number) => ({
    x: ((node % SIZE) + 0.5) / SUBTILES,
    y: (Math.floor(node / SIZE) + 0.5) / SUBTILES,
  });
  const before = (a: number, b: number) =>
    priority[a] < priority[b] || (priority[a] === priority[b] && order[a] < order[b]);
  const queue = (node: number) => {
    if (Number.isNaN(heuristic[node])) heuristic[node] = distanceTo(center(node), target);
    priority[node] = cost[node] + heuristic[node];
    let at = position[node];
    if (at < 0) {
      at = open.length;
      open.push(node);
      order[node] = sequence++;
    }
    while (at > 0) {
      const parent = (at - 1) >> 1;
      if (!before(node, open[parent])) break;
      open[at] = open[parent];
      position[open[at]] = at;
      at = parent;
    }
    open[at] = node;
    position[node] = at;
  };
  const take = () => {
    const node = open[0],
      last = open.pop()!;
    position[node] = -1;
    if (open.length) {
      let at = 0;
      while (at * 2 + 1 < open.length) {
        let child = at * 2 + 1;
        if (child + 1 < open.length && before(open[child + 1], open[child])) child++;
        if (!before(open[child], last)) break;
        open[at] = open[child];
        position[open[at]] = at;
        at = child;
      }
      open[at] = last;
      position[last] = at;
    }
    return node;
  };
  const step = 1 / SUBTILES;
  cost[first] = 0;
  queue(first);
  let goal = -1;
  let approach: { x: number; y: number } | undefined;
  while (open.length) {
    const current = take();
    closed[current] = 1;
    const x = current % SIZE,
      y = Math.floor(current / SIZE),
      here = center(current);
    if (distanceTo(here, target) <= range) {
      if (current === first && distanceTo(start, target) > range) approach = here;
      goal = current;
      break;
    }
    if (range < 0.5 && !blocked[current]) {
      const s = 'level' in target ? BUILDINGS[target.kind].size : 0;
      const tx = Math.max(target.x, Math.min(here.x, target.x + s));
      const ty = Math.max(target.y, Math.min(here.y, target.y + s));
      const dx = here.x - tx,
        dy = here.y - ty,
        distance = distance2D(dx, dy);
      const reach = Math.max(0, range - 1e-6);
      const point = { x: tx + (dx * reach) / distance, y: ty + (dy * reach) / distance };
      if (Math.floor(point.x * SUBTILES) === x && Math.floor(point.y * SUBTILES) === y) {
        approach = point;
        goal = current;
        break;
      }
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
      const n = ny * SIZE + nx;
      if (blocked[n] || closed[n]) continue;
      const next = cost[current] + step + (wall[n] ? 6 * step : 0);
      if (next < cost[n]) {
        cost[n] = next;
        prev[n] = current;
        queue(n);
      }
    }
  }
  if (goal < 0) return [];
  // `LogicPathFinderNew.FindPath`: a clear sight line replaces the searched route with a single
  // straight walk to its end point, so open ground is crossed directly rather than in steps.
  if (goal !== first && lineOfSight(sx, sy, goal % SIZE, Math.floor(goal / SIZE)))
    return [approach ?? center(goal)];
  const path = [];
  while (goal !== first && goal >= 0) {
    path.push(center(goal));
    goal = prev[goal];
  }
  path.reverse();
  if (approach) path.push(approach);
  return path;
}

/**
 * Ground collision cells for movement effects (vortex carry, pushback). Version-44 native
 * campaign battles use sub-tile building collision; every other battle keeps whole-tile
 * footprints. `cell` identifies the collision cell so a unit already inside one may leave it.
 */
export function groundCollision(battle: { nativeSubtiles?: true }, buildings: readonly Building[]) {
  if (battle.nativeSubtiles) {
    const solid = subtileSolid(buildings);
    return {
      cell: (x: number, y: number) => Math.floor(y * SUBTILES) * SIZE + Math.floor(x * SUBTILES),
      solid,
    };
  }
  const tiles = new Set<number>();
  for (const b of buildings)
    if (b.hp > 0 && !isTrap(b.kind)) {
      const size = BUILDINGS[b.kind].size;
      for (let x = b.x; x < b.x + size; x++)
        for (let y = b.y; y < b.y + size; y++) tiles.add(y * MAP_SIZE + x);
    }
  const cell = (x: number, y: number) => Math.floor(y) * MAP_SIZE + Math.floor(x);
  return { cell, solid: (x: number, y: number) => tiles.has(cell(x, y)) };
}
export type GroundCollision = ReturnType<typeof groundCollision>;
