import type { Battle } from './model';
import type { GarrisonDefender } from './defenders';
import { garrisonStats, type GarrisonKind } from './garrison-kinds';

export function garrisonPreAttackEnabled(battle: Battle, kind: GarrisonKind) {
  return (
    (kind === 'electrodragon' && !!battle.nativeGarrisonPreAttack) ||
    (kind === 'bowler' && !!battle.nativeGarrisonBowlerPreAttack)
  );
}
/** Original pre-attack samples use active wall time; completed Bowler takes retain their tails. */
export function stepGarrisonPreAttack(
  battle: Battle,
  defender: GarrisonDefender,
  activeDt: number,
  attackDt: number,
  recoveryAtStart: number,
  fresh = false,
) {
  if (!garrisonPreAttackEnabled(battle, defender.kind)) return;
  if (!defender.engaged || defender.target === null) {
    delete defender.preAttack;
    return;
  }
  const n = defender.attackCount ?? defender.attacks.length;
  if (fresh && defender.kind === 'bowler') {
    const stats = garrisonStats(defender.kind, defender.level);
    defender.preAttack = {
      n,
      targetId: defender.target,
      age: stats.rate - stats.recovery - stats.firstAttackDelay,
      lastAt: battle.elapsed,
      waiting: true,
    };
  }
  const previous = defender.preAttack;
  if (defender.cooldown <= 1e-9) {
    if (defender.kind === 'bowler' && previous) {
      const history = (defender.preAttackHistory ??= []);
      history.push({
        n: previous.n,
        targetId: previous.targetId,
        at: battle.elapsed - previous.age - activeDt,
      });
      if (history.length > 16) history.splice(0, history.length - 16);
    }
    delete defender.preAttack;
    return;
  }
  if ((defender.recovery ?? 0) > 1e-9) {
    if (!previous?.waiting) delete defender.preAttack;
    return;
  }
  const age = activeDt * (attackDt > 0 ? Math.max(0, 1 - recoveryAtStart / attackDt) : 0);
  if (age <= 0) return;
  if (!previous || previous.n !== n || previous.targetId !== defender.target)
    defender.preAttack = { n, targetId: defender.target, age, lastAt: battle.elapsed };
  else {
    previous.age += age;
    delete previous.waiting;
    previous.lastAt = battle.elapsed;
  }
}
export function stopGarrisonPreAttack(battle: Battle, defender: GarrisonDefender) {
  if (garrisonPreAttackEnabled(battle, defender.kind)) delete defender.preAttack;
}
