import type { LateCombatContext } from './late-campaign';
import type { Battle, Building } from './model';

/** Ghost Trap: releases a defending Royal Ghost.
 * The campaign gate keeps affected villages unavailable until this is true. */
export const GHOST_TRAP_READY = false;
/** Battle-only state, reconstructed from the replay snapshot and simulation clock. */
export type GhostTrapBattleState = Record<string, never>;
/** Per-attacker status owned by this family. */
export type GhostTrapUnitState = Record<string, never>;

export function stepGhostTrap(context: LateCombatContext) {
  void context;
}
/** True while this family still has an unresolved effect that must finish before results. */
export function ghostTrapPending(battle: Battle) {
  void battle;
  return false;
}
export function ghostTrapDestroyed(context: LateCombatContext, building: Building, at: number) {
  void context;
  void building;
  void at;
}
