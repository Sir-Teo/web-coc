import type { Battle, Unit } from '../game/model';

/** The Vial's own deadline, even when another source supplies the stronger boost. */
export function rageVialRemaining(battle: Pick<Battle, 'elapsed'>, unit?: Unit) {
  if (unit?.hero !== 'king' || unit.hp <= 0 || unit.spent || unit.native?.recalled) return 0;
  const until = unit.native?.effects?.boost?.sources?.['ability:BarbarianKingRage']?.until;
  return until === undefined ? 0 : Math.max(0, Math.ceil(until - battle.elapsed - 1e-9));
}
