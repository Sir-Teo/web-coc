import type { Defender } from './defenders';
import type { Battle } from './model';
import { spellTowerDefenderHidden } from './spell-tower';

/** Local cue for campaign Invisibility, matching the attacking troop presentation. */
export const DEFENDER_INVISIBILITY_ALPHA = 0.35;

/** Dead bodies keep their existing defeat animation instead of the living concealment cue. */
export function defenderOpacity(battle: Battle, defender: Defender) {
  return defender.hp > 0 && spellTowerDefenderHidden(battle, defender)
    ? DEFENDER_INVISIBILITY_ALPHA
    : 1;
}
