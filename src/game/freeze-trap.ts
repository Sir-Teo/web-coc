import type { LateCombatContext } from './late-campaign';
import type { Battle, Building, Unit } from './model';

/** Goblin Freeze Trap: stops attackers in place.
 * The campaign gate keeps affected villages unavailable until this is true. */
export const FREEZE_TRAP_READY = false;
/** Battle-only state, reconstructed from the replay snapshot and simulation clock. */
export type FreezeTrapBattleState = Record<string, never>;
/** Per-attacker status owned by this family. */
export type FreezeTrapUnitState = Record<string, never>;

export function stepFreezeTrap(context: LateCombatContext) {
  void context;
}
/** True while this family still has an unresolved effect that must finish before results. */
export function freezeTrapPending(battle: Battle) {
  void battle;
  return false;
}
export function freezeTrapDestroyed(context: LateCombatContext, building: Building, at: number) {
  void context;
  void building;
  void at;
}

/** A frozen attacker neither moves nor attacks. */
export function freezeTrapHolds(battle: Battle, unit: Unit) {
  void battle;
  void unit;
  return false;
}
