import type { Battle } from './model';
import type { Defender } from './defenders';

const NEUTRAL = Object.freeze({ move: 1, attack: 1 });

/** Native poison's signed percentages slow garrison troops and trap skeletons from version 61. */
export function defenderPoisonScales(battle: Battle, defender: Defender) {
  const poison = defender.poison;
  if (!battle.nativeDefenderPoison || !poison || poison.until <= battle.elapsed) return NEUTRAL;
  return {
    move: Math.max(0, 1 + poison.speed),
    attack: Math.max(0.05, 1 + poison.attack),
  };
}
