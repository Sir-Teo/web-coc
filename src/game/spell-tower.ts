import type { LateCombatContext } from './late-campaign';
import type { Battle, Building, Unit } from './model';

/** Spell Tower: defensive Rage, Poison and Invisibility casts.
 * The campaign gate keeps affected villages unavailable until this is true. */
export const SPELL_TOWER_READY = false;
/** Battle-only state, reconstructed from the replay snapshot and simulation clock. */
export type SpellTowerBattleState = Record<string, never>;
/** Per-attacker status owned by this family. */
export type SpellTowerUnitState = Record<string, never>;

export function stepSpellTower(context: LateCombatContext) {
  void context;
}
/** True while this family still has an unresolved effect that must finish before results. */
export function spellTowerPending(battle: Battle) {
  void battle;
  return false;
}
export function spellTowerDestroyed(context: LateCombatContext, building: Building, at: number) {
  void context;
  void building;
  void at;
}

/** Rage: multipliers for a defense's damage and firing rate at the current battle time. */
export function spellTowerDefenseBoost(battle: Battle, building: Building) {
  void battle;
  void building;
  return { damage: 1, rate: 1 };
}
/** Invisibility: buildings that attackers can neither target nor path toward. */
export function spellTowerHidden(battle: Battle, building: Building) {
  void battle;
  void building;
  return false;
}
/** Poison: fraction of normal movement and attack time an attacker receives. */
export function spellTowerTimeScale(battle: Battle, unit: Unit) {
  void battle;
  void unit;
  return 1;
}
