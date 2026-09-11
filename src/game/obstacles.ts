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
): value is Obstacle[] {
  if (!Array.isArray(value) || value.length > 45) return false;
  const ids = new Set<number>();
  for (const o of value) {
    if (
      !o ||
      !Object.hasOwn(OBSTACLES, o.kind) ||
      !Number.isInteger(o.id) ||
      o.id < 1 ||
      ids.has(o.id) ||
      !Number.isInteger(o.x) ||
      !Number.isInteger(o.y) ||
      o.x < 0 ||
      o.y < 0 ||
      o.x + 2 > 28 ||
      o.y + 2 > 28
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
    if (buildings.some((b) => overlapsObstacle([o], b.x, b.y, BUILDINGS[b.kind].size)))
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
