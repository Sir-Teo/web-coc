import { buildingHidden } from './native-status';
import { distance2D } from './distance';
import { BUILDINGS, TROOPS, isTrap } from './data';
import type { Battle, Building, FX } from './model';
import { TESLA } from './tesla-stats';
import { lateBuildingHidden } from './late-campaign';

/** Public client data: 600 hundredths of a tile; destruction threshold 50. */
export const TESLA_TRIGGER = TESLA.trigger;
export const TESLA_REVEAL_PERCENT = 50;

export function concealedTesla(battle: Battle, building: Building) {
  return (
    building.kind === 'tesla' &&
    !building.constructing &&
    !building.upgradeEnd &&
    battle.revealedTeslas?.[building.id] === undefined
  );
}

export function targetableBuilding(battle: Battle, building: Building) {
  return (
    building.hp > 0 &&
    !isTrap(building.kind) &&
    !concealedTesla(battle, building) &&
    !lateBuildingHidden(battle, building)
  );
}
/** Late campaign Invisibility only blocks targeting: a concealed defense still fires and area
 * effects still reach it; a buried Tesla does neither. Identical to `targetableBuilding`
 * whenever no late campaign state exists. */
export function presentBuilding(battle: Battle, building: Building) {
  return building.hp > 0 && !isTrap(building.kind) && !concealedTesla(battle, building);
}

/** A Tesla stays up for the rest of this attack. Reveal invalidates offensive routes. */
export function revealTeslas(battle: Battle, effect: (fx: FX) => void) {
  let changed = false;
  for (const tower of battle.buildings) {
    if (tower.hp <= 0 || !concealedTesla(battle, tower)) continue;
    const x = tower.x + BUILDINGS.tesla.size / 2,
      y = tower.y + BUILDINGS.tesla.size / 2;
    if (
      battle.destruction <= TESLA_REVEAL_PERCENT &&
      !battle.units.some((u) => u.hp > 0 && distance2D(u.x - x, u.y - y) <= TESLA_TRIGGER)
    )
      continue;
    (battle.revealedTeslas ??= {})[tower.id] = battle.elapsed;
    changed = true;
    effect({ type: 'tesla-reveal', sourceId: tower.id, x, y });
  }
  if (changed)
    for (const unit of battle.units) {
      if (unit.hp <= 0 || TROOPS[unit.kind].healer) continue;
      unit.target = null;
      unit.path = [];
      unit.pathAt = 0;
      unit.attacking = false;
    }
  return changed;
}
