import type { Battle, Unit } from './model';

/** Actors that have entered the fight; invisibility and burrowing do not remove an ally. */
export const friendlyCombatant = (unit: Unit, at: number) =>
  unit.hp > 0 &&
  !unit.ejected &&
  !unit.native?.recalled &&
  !unit.native?.phoenixWaiting &&
  !unit.native?.untargetable &&
  (unit.spawnedAt ?? 0) <= at + 1e-9;

/** Version 96 shares the native immunity/participation rules across healing paths. */
export const healingEligible = (battle: Battle, unit: Unit, at = battle.elapsed) =>
  !battle.nativeFriendlyEligibility || (friendlyCombatant(unit, at) && !unit.native?.noHealing);
