import type { LateCombatContext } from './late-campaign';
import type { Battle, Building } from './model';

/** Monolith: base damage plus a share of the target's hitpoints.
 * The campaign gate keeps affected villages unavailable until this is true. */
export const MONOLITH_READY = false;
/** Battle-only state, reconstructed from the replay snapshot and simulation clock. */
export type MonolithBattleState = Record<string, never>;
/** Per-attacker status owned by this family. */
export type MonolithUnitState = Record<string, never>;

export function stepMonolith(context: LateCombatContext) {
  void context;
}
/** True while this family still has an unresolved effect that must finish before results. */
export function monolithPending(battle: Battle) {
  void battle;
  return false;
}
export function monolithDestroyed(context: LateCombatContext, building: Building, at: number) {
  void context;
  void building;
  void at;
}
