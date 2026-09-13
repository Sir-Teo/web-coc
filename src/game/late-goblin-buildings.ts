import type { LateCombatContext } from './late-campaign';
import type { Battle, Building } from './model';

/** Communications Mast, Goblin Hall (including its level-2 weapon), Goblin Castle,
 * Foreboding Cave and the Goblin Boss Town Hall with its weapon.
 * The campaign gate keeps affected villages unavailable until this is true. */
export const LATE_GOBLIN_BUILDINGS_READY = false;
/** Battle-only state, reconstructed from the replay snapshot and simulation clock. */
export type LateGoblinBuildingsBattleState = Record<string, never>;
/** Per-attacker status owned by this family. */
export type LateGoblinBuildingsUnitState = Record<string, never>;

export function stepLateGoblinBuildings(context: LateCombatContext) {
  void context;
}
/** True while this family still has an unresolved effect that must finish before results. */
export function lateGoblinBuildingsPending(battle: Battle) {
  void battle;
  return false;
}
export function lateGoblinBuildingsDestroyed(
  context: LateCombatContext,
  building: Building,
  at: number,
) {
  void context;
  void building;
  void at;
}
