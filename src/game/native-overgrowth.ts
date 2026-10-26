import { BUILDINGS } from './data';
import type { Battle, Building } from './model';

export interface OvergrowthRoot {
  key: string;
  buildingId: number;
  x: number;
  y: number;
  size: number;
  at: number;
  until: number;
}
/** Capture external root lifetimes without changing their immunity or target rules. */
export function recordOvergrowthRoot(
  battle: Battle,
  building: Building,
  at: number,
  until: number,
  castId: number,
) {
  if (!battle.nativeOvergrowthPresentation) return;
  const roots = (battle.nativeOvergrowthRoots ??= []),
    active = roots.find(
      (r) => r.buildingId === building.id && r.at <= at + 1e-9 && r.until > at + 1e-9,
    );
  if (active) {
    active.until = Math.max(active.until, until);
    return;
  }
  const size = BUILDINGS[building.kind].size;
  roots.push({
    key: `overgrowth:${castId}:${building.id}`,
    buildingId: building.id,
    x: building.x + size / 2,
    y: building.y + size / 2,
    size,
    at,
    until,
  });
}
export function retireOvergrowthRoots(battle: Battle) {
  if (battle.nativeOvergrowthPresentation && battle.nativeOvergrowthRoots)
    battle.nativeOvergrowthRoots = battle.nativeOvergrowthRoots.filter(
      (r) => r.until + 10 >= battle.elapsed - 1e-9,
    );
}
