import type { Battle } from './model';
import type { Defender } from './defenders';
import { defenderHitPoisonScales } from './defender-hit-poison';

const NEUTRAL = Object.freeze({ move: 1, attack: 1 });

/** Native poison's signed percentages slow garrison troops and trap skeletons from version 61. */
export function defenderPoisonScales(battle: Battle, defender: Defender) {
  const poison = defender.poison;
  const hit = defenderHitPoisonScales(defender, battle.elapsed);
  const area =
    battle.nativeDefenderPoison && poison && poison.until > battle.elapsed
      ? { move: Math.max(0, 1 + poison.speed), attack: Math.max(0.05, 1 + poison.attack) }
      : undefined;
  if (!area) return hit ?? NEUTRAL;
  return hit
    ? { move: Math.min(area.move, hit.move), attack: Math.min(area.attack, hit.attack) }
    : area;
}
