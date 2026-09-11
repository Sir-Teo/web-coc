import { BUILDINGS } from './data';
import {
  BUILD_MIN,
  BUILD_MAX,
  MAP_SIZE,
  LEGACY_MAP_SIZE,
  EXPANDED_DEFENSES,
  legacySize,
} from './grid';
import type { Building, Save } from './model';
import type { Obstacle } from './obstacles';

/** Reject overlapping input before any migration attempts to rearrange it. */
export function validArrangement(
  buildings: readonly Building[],
  obstacles: readonly Obstacle[] = [],
  legacy = false,
) {
  const side = legacy ? LEGACY_MAP_SIZE : MAP_SIZE;
  const occupied = new Uint8Array(side * side);
  const objects = [
    ...buildings.map((b) => ({
      ...b,
      size: legacy ? legacySize(b.kind, BUILDINGS[b.kind].size) : BUILDINGS[b.kind].size,
    })),
    ...obstacles.map((o) => ({ ...o, size: 2 })),
  ];
  for (const o of objects) {
    if (o.x < 0 || o.y < 0 || o.x + o.size > side || o.y + o.size > side) return false;
    for (let y = o.y; y < o.y + o.size; y++)
      for (let x = o.x; x < o.x + o.size; x++) {
        if (occupied[y * side + x]) return false;
        occupied[y * side + x] = 1;
      }
  }
  return true;
}

const spread = <T extends { x: number; y: number }>(o: T): T => ({
  ...o,
  x: Math.floor(o.x * 1.5) + BUILD_MIN,
  y: Math.floor(o.y * 1.5) + BUILD_MIN,
});

/** Keep unchanged structures and obstacles fixed, then relocate only conflicting defenses. */
function arrange(buildings: Building[], obstacles: Obstacle[]) {
  const placed = buildings.map((b) => ({ ...b }));
  const occupied = new Uint8Array(MAP_SIZE * MAP_SIZE);
  const occupy = (x: number, y: number, size: number) => {
    for (let yy = y; yy < y + size; yy++)
      for (let xx = x; xx < x + size; xx++) occupied[yy * MAP_SIZE + xx] = 1;
  };
  const free = (x: number, y: number, size: number) => {
    if (x < 0 || y < 0 || x + size > MAP_SIZE || y + size > MAP_SIZE) return false;
    for (let yy = y; yy < y + size; yy++)
      for (let xx = x; xx < x + size; xx++) if (occupied[yy * MAP_SIZE + xx]) return false;
    return true;
  };
  for (const b of placed)
    if (!EXPANDED_DEFENSES.has(b.kind)) occupy(b.x, b.y, BUILDINGS[b.kind].size);
  for (const o of obstacles) occupy(o.x, o.y, 2);
  const pending: Building[] = [];
  for (const b of placed.filter((b) => EXPANDED_DEFENSES.has(b.kind)).sort((a, b) => a.id - b.id)) {
    if (free(b.x, b.y, 3)) occupy(b.x, b.y, 3);
    else pending.push(b);
  }
  for (const b of pending) {
    const sites: { x: number; y: number; distance: number }[] = [];
    for (let y = BUILD_MIN; y + 3 <= BUILD_MAX; y++)
      for (let x = BUILD_MIN; x + 3 <= BUILD_MAX; x++)
        sites.push({ x, y, distance: Math.abs(x - b.x) + Math.abs(y - b.y) });
    sites.sort((a, b) => a.distance - b.distance || a.y - b.y || a.x - b.x);
    const site = sites.find((s) => free(s.x, s.y, 3));
    if (!site) {
      // A 1.5× coordinate expansion fits every valid 28×28 legacy arrangement
      // inside the new buildable area, including tightly packed 2×2 defenses.
      return { buildings: buildings.map(spread), obstacles: obstacles.map(spread), spread: true };
    }
    b.x = site.x;
    b.y = site.y;
    occupy(b.x, b.y, 3);
  }
  return { buildings: placed, obstacles, spread: false };
}

/** Called only after legacy fields, bounds and non-overlap have been validated. */
export function migrateFootprints(save: Save) {
  const original = save.buildings;
  const result = arrange(original, save.obstacles ?? []);
  save.buildings = result.buildings;
  if (save.obstacles) save.obstacles = result.obstacles;
  for (const layout of save.layouts ?? []) {
    const slots = new Map(layout.slots.map((s) => [s.id, s]));
    const buildings = original.map((b) => ({ ...b, ...slots.get(b.id) }));
    // Older layout slots can already be blocked by structures built since they
    // were saved. Preserve these slots; the normal restore check explains that.
    if (!validArrangement(buildings, [], true)) continue;
    const migrated = result.spread ? buildings.map(spread) : arrange(buildings, []).buildings;
    // Include every current building so a relocated non-slot building cannot
    // silently prevent restoration of the migrated arrangement.
    layout.slots = migrated.map(({ id, x, y }) => ({ id, x, y }));
  }
  return result.buildings.filter((b, i) => b.x !== original[i].x || b.y !== original[i].y).length;
}
