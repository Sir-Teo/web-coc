import type { LateCombatContext } from './late-campaign';
import type { Battle, Building, Unit } from './model';

/** Tornado Trap: vortex that draws attackers in.
 * The campaign gate keeps affected villages unavailable until this is true. */
export const TORNADO_TRAP_READY = false;
/** Battle-only state, reconstructed from the replay snapshot and simulation clock. */
export type TornadoTrapBattleState = Record<string, never>;
/** Per-attacker status owned by this family. */
export type TornadoTrapUnitState = Record<string, never>;

export function stepTornadoTrap(context: LateCombatContext) {
  void context;
}
/** True while this family still has an unresolved effect that must finish before results. */
export function tornadoTrapPending(battle: Battle) {
  void battle;
  return false;
}
export function tornadoTrapDestroyed(context: LateCombatContext, building: Building, at: number) {
  void context;
  void building;
  void at;
}

/** A troop caught in the vortex is moved by the trap instead of its own navigation. */
export function tornadoTrapHolds(battle: Battle, unit: Unit) {
  void battle;
  void unit;
  return false;
}
