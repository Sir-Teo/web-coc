import { BUILDINGS } from './data';
import { distance2D } from './distance';
import { defenderHidden } from './defender-visibility';
import { garrisonDefenderTargetable } from './garrison-abilities';
import { targetableBuilding } from './hidden-tesla';
import { distanceTo, type Battle, type Unit, type Building } from './model';
import { preferredDefense } from './native-defense-preference';

export interface AbilityProjectileTarget {
  id: number;
  x: number;
  y: number;
  distance: number;
  building: boolean;
  air: boolean;
}

/** Source Defense preference, then visible ordinary buildings and both defender layers. */
export function abilityProjectileTargets(battle: Battle, unit: Unit, at: number, count = 1) {
  const buildings = battle.buildings.filter(
    (b) => b.kind !== 'wall' && targetableBuilding(battle, b),
  );
  const defenses = buildings.filter((b) => preferredDefense(battle, b, at));
  const target = (b: Building): AbilityProjectileTarget => ({
    id: b.id,
    x: b.x + BUILDINGS[b.kind].size / 2,
    y: b.y + BUILDINGS[b.kind].size / 2,
    distance: distanceTo(unit, b),
    building: true,
    air: false,
  });
  const order = (a: AbilityProjectileTarget, b: AbilityProjectileTarget) =>
    a.distance - b.distance || a.id - b.id;
  const first = defenses.map(target).sort(order);
  if (first.length >= count) return first.slice(0, count);
  const defenseIds = new Set(defenses.map((b) => b.id));
  const fallback = buildings.filter((b) => !defenseIds.has(b.id)).map(target);
  for (const d of battle.defenders ?? [])
    if (
      d.hp > 0 &&
      d.kind !== 'repairer' &&
      d.spawnedAt <= at + 1e-9 &&
      !defenderHidden(battle, d) &&
      garrisonDefenderTargetable(battle, d)
    )
      fallback.push({
        id: d.id,
        x: d.x,
        y: d.y,
        distance: distance2D(d.x - unit.x, d.y - unit.y),
        building: false,
        air: d.mode === 'air',
      });
  return [...first, ...fallback.sort(order)].slice(0, count);
}
