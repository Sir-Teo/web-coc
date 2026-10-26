import type { Defender } from './defenders';
import type { Battle } from './model';
import { spellTowerDefenderHidden } from './spell-tower';

/** Native spell pulses and historical campaign Spell Towers share target concealment. */
export function defenderHidden(battle: Battle, defender: Pick<Defender, 'id' | 'invisibleUntil'>) {
  return (
    (defender.invisibleUntil ?? 0) > battle.elapsed + 1e-9 ||
    spellTowerDefenderHidden(battle, defender)
  );
}
