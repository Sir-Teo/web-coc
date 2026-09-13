import type { LateCombatContext } from './late-campaign';
import type { Battle, Building } from './model';

/** Scattershot: heavy projectile, impact splash and trailing shards.
 * The campaign gate keeps affected villages unavailable until this is true. */
export const SCATTERSHOT_READY = false;
/** Battle-only state, reconstructed from the replay snapshot and simulation clock. */
export type ScattershotBattleState = Record<string, never>;
/** Per-attacker status owned by this family. */
export type ScattershotUnitState = Record<string, never>;

export function stepScattershot(context: LateCombatContext) {
  void context;
}
/** True while this family still has an unresolved effect that must finish before results. */
export function scattershotPending(battle: Battle) {
  void battle;
  return false;
}
export function scattershotDestroyed(context: LateCombatContext, building: Building, at: number) {
  void context;
  void building;
  void at;
}
