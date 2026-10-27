import { preferredDefense } from './native-defense-preference';
import { targetableBuilding } from './hidden-tesla';
import { distanceTo, type Battle, type Building, type Unit } from './model';

/** Meteor Staff prefers targetable defenses, then the nearest ordinary building at any range. */
export function meteorStaffTarget(battle: Battle, unit: Unit, at: number) {
  let nearest: Building | undefined,
    defense = false,
    distance = Infinity;
  for (const building of battle.buildings) {
    if (building.kind === 'wall' || !targetableBuilding(battle, building)) continue;
    const preferred = preferredDefense(battle, building, at),
      next = distanceTo(unit, building);
    if (
      !nearest ||
      (preferred && !defense) ||
      (preferred === defense &&
        (next < distance || (next === distance && building.id < nearest.id)))
    ) {
      nearest = building;
      defense = preferred;
      distance = next;
    }
  }
  return nearest;
}
