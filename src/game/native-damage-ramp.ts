import type { Unit } from './model';

/** Source IncreasingDamage values for one troop tier. */
export interface NativeDamageRampStats {
  dps: readonly [number, number, number];
  switchAt: readonly [number, number];
  killedCooldown: number;
}
export interface NativeDamageRamp {
  targetId: number;
  defender: boolean;
  startedAt: number;
}

/** Both armies' target identifiers occupy separate namespaces. */
export function rampedDamage(
  unit: Unit,
  stats: NativeDamageRampStats,
  damage: number,
  targetId: number,
  defender: boolean,
  at: number,
) {
  const native = (unit.native ??= {});
  let ramp = native.damageRamp;
  if (!ramp || ramp.targetId !== targetId || ramp.defender !== defender)
    native.damageRamp = ramp = { targetId, defender, startedAt: at };
  const elapsed = at - ramp.startedAt;
  const stage =
    elapsed + 1e-9 >= stats.switchAt[1] ? 2 : elapsed + 1e-9 >= stats.switchAt[0] ? 1 : 0;
  return stats.dps[0] > 0 ? (damage * stats.dps[stage]) / stats.dps[0] : damage;
}

/** A direct killing hit starts recovery at the hit sample, rather than one tick later. */
export function finishRampingHit(unit: Unit, target: { hp: number }, stats: NativeDamageRampStats) {
  if (target.hp > 0) return;
  unit.cooldown = Math.max(unit.cooldown, stats.killedCooldown);
  delete unit.native?.damageRamp;
}
