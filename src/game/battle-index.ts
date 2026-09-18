import type { Battle, Building, Unit } from './model';
import type { Defender } from './defenders';

/**
 * Id lookups shared by presentation layers within one rendered frame. Each index is rebuilt at
 * most once per simulation step (keyed by the array, its length and the battle clock), so a
 * render pass never pays a linear `find` per lookup and never reads a stale entry after a step.
 */
interface Entry<T> {
  length: number;
  elapsed: number;
  map: Map<number, T>;
}
const caches = new WeakMap<object, Entry<unknown>>();
const EMPTY: Defender[] = [];

function index<T extends { id: number }>(list: readonly T[], elapsed: number): Map<number, T> {
  const hit = caches.get(list) as Entry<T> | undefined;
  if (hit && hit.length === list.length && hit.elapsed === elapsed) return hit.map;
  const map = hit?.map ?? new Map<number, T>();
  map.clear();
  // First occurrence wins, as with Array.prototype.find.
  for (const item of list) if (!map.has(item.id)) map.set(item.id, item);
  caches.set(list, { length: list.length, elapsed, map });
  return map;
}

export const buildingIndex = (battle: Pick<Battle, 'buildings' | 'elapsed'>) =>
  index<Building>(battle.buildings, battle.elapsed);
export const unitIndex = (battle: Pick<Battle, 'units' | 'elapsed'>) =>
  index<Unit>(battle.units, battle.elapsed);
export const defenderIndex = (battle: Pick<Battle, 'defenders' | 'elapsed'>) =>
  index<Defender>(battle.defenders ?? EMPTY, battle.elapsed);
