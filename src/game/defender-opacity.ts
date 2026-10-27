import type { Defender } from './defenders';
import type { Battle } from './model';
import { defenderHidden } from './defender-visibility';

/** Local Invisibility cue, matching the attacking troop presentation. */
export const DEFENDER_INVISIBILITY_ALPHA = 0.35;

/** Dead bodies keep their existing defeat animation instead of the living concealment cue. */
export function defenderOpacity(battle: Battle, defender: Defender) {
  return defender.hp > 0 && defenderHidden(battle, defender) ? DEFENDER_INVISIBILITY_ALPHA : 1;
}
