import type { LateCombatContext } from './late-campaign';
import type { Battle, Building } from './model';

/** Eagle Artillery: activation, shell bursts, splash and pushback.
 * The campaign gate keeps affected villages unavailable until this is true. */
export const EAGLE_ARTILLERY_READY = false;
/** Battle-only state, reconstructed from the replay snapshot and simulation clock. */
export type EagleArtilleryBattleState = Record<string, never>;
/** Per-attacker status owned by this family. */
export type EagleArtilleryUnitState = Record<string, never>;

export function stepEagleArtillery(context: LateCombatContext) {
  void context;
}
/** True while this family still has an unresolved effect that must finish before results. */
export function eagleArtilleryPending(battle: Battle) {
  void battle;
  return false;
}
export function eagleArtilleryDestroyed(
  context: LateCombatContext,
  building: Building,
  at: number,
) {
  void context;
  void building;
  void at;
}
