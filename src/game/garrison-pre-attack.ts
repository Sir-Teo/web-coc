import type { Battle } from './model';
import type { GarrisonDefender } from './defenders';

/** Original Electro Dragon charge audio follows active wall time, as for the attacking troop. */
export function stepGarrisonPreAttack(
  battle: Battle,
  defender: GarrisonDefender,
  activeDt: number,
  attackDt: number,
  recoveryAtStart: number,
) {
  if (!battle.nativeGarrisonPreAttack || defender.kind !== 'electrodragon') return;
  if (!defender.engaged || defender.cooldown <= 1e-9 || (defender.recovery ?? 0) > 1e-9) {
    delete defender.preAttack;
    return;
  }
  const age = activeDt * (attackDt > 0 ? Math.max(0, 1 - recoveryAtStart / attackDt) : 0);
  if (age <= 0 || defender.target === null) return;
  const n = defender.attackCount ?? defender.attacks.length,
    previous = defender.preAttack;
  if (!previous || previous.n !== n || previous.targetId !== defender.target)
    defender.preAttack = { n, targetId: defender.target, age, lastAt: battle.elapsed };
  else {
    previous.age += age;
    previous.lastAt = battle.elapsed;
  }
}
export function stopGarrisonPreAttack(battle: Battle, defender: GarrisonDefender) {
  if (battle.nativeGarrisonPreAttack) delete defender.preAttack;
}
