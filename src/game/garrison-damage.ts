import type { Battle, Unit } from './model';
import { hurtUnit } from './native-status';

/** Source defenders share attacker protections; historical recordings keep raw HP subtraction. */
export function hurtGarrisonUnit(
  battle: Battle,
  unit: Unit,
  damage: number,
  at: number,
  sourceId?: number,
) {
  if (battle.nativeGarrisonDamage) {
    hurtUnit(battle, unit, damage, at, sourceId);
    // Preserve the garrison engine's existing zero floor after a lethal hit.
    unit.hp = Math.max(0, unit.hp);
  } else unit.hp = Math.max(0, unit.hp - damage);
}
