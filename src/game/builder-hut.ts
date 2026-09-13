import type { LateCombatContext } from './late-campaign';
import type { Battle, Building } from './model';

/** Armed Builder's Huts: nail turret and repairing Defending Builder.
 * The campaign gate keeps affected villages unavailable until this is true. */
export const BUILDER_HUT_READY = false;
/** Battle-only state, reconstructed from the replay snapshot and simulation clock. */
export type BuilderHutBattleState = Record<string, never>;
/** Per-attacker status owned by this family. */
export type BuilderHutUnitState = Record<string, never>;

export function stepBuilderHut(context: LateCombatContext) {
  void context;
}
/** True while this family still has an unresolved effect that must finish before results. */
export function builderHutPending(battle: Battle) {
  void battle;
  return false;
}
export function builderHutDestroyed(context: LateCombatContext, building: Building, at: number) {
  void context;
  void building;
  void at;
}
