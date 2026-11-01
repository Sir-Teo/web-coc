import { burstGap } from './native-burst-timing';
import { splitTiming } from './garrison-kinds';
import { nativeUnitRow, nativeUnitStats } from './native-units';
import { num, seconds } from './native-data';
import { chainRef, resolveChainTarget, type ChainRef, type ChainTarget } from './chain-targets';
import type { Unit } from './model';
import type { NativeTroopContext } from './native-troops';

const cache = new Map<number, ReturnType<typeof resolveStats>>();
function resolveStats(level: number) {
  const stats = nativeUnitStats('superdragon', level),
    row = nativeUnitRow('superdragon', stats.level),
    count = num(row, 'BurstCount'),
    delay = seconds(row, 'BurstDelay'),
    gap = burstGap(stats.rate),
    firstHit = burstGap(splitTiming(row).firstHit),
    period = gap + (count - 1) * delay;
  if (count < 2 || delay <= 0 || firstHit <= 0 || gap < firstHit)
    throw Error('Unsupported Super Dragon burst');
  return {
    count,
    delay,
    period,
    firstHit,
    afterBurst: gap - firstHit,
    damage: (stats.dps * period) / count,
    timing: { period, windup: firstHit, recovery: period - firstHit, charge: 0, firstHit },
  };
}
export function superDragonBurstStats(level: number) {
  let result = cache.get(level);
  if (!result) cache.set(level, (result = resolveStats(level)));
  return result;
}

export interface SuperDragonBurstState {
  shotsLeft: number;
  remaining: number;
  lastAt: number;
  target?: ChainRef;
}
export function prepareSuperDragonBurst(unit: Unit, at: number) {
  return ((unit.native ??= {}).superDragonBurst ??= { shotsLeft: 0, remaining: 0, lastAt: at });
}
/** The first flame shares the attack controller's fractional charge remainder. */
export function beginSuperDragonBurst(unit: Unit, target: ChainTarget, at: number, rate: number) {
  const state = prepareSuperDragonBurst(unit, at),
    stats = superDragonBurstStats(unit.level ?? 1),
    overshoot = Math.min(0, unit.native!.attackWindup!.remaining);
  state.shotsLeft = stats.count - 1;
  state.remaining = stats.delay + overshoot;
  state.lastAt = at;
  state.target = chainRef(target);
  return rate > 0 ? at + overshoot / rate : at;
}
/** Remaining flames advance in active attack time; loss of the target cancels the take. */
export function stepSuperDragonBurst(
  ctx: NativeTroopContext,
  unit: Unit,
  rate: number,
  release: (target: ChainTarget, at: number) => void,
) {
  const state = unit.native!.superDragonBurst!,
    windup = unit.native!.attackWindup!,
    at = ctx.battle.elapsed;
  if (!state.shotsLeft) return false;
  const target = state.target && resolveChainTarget(ctx, state.target, at),
    same =
      windup.engaged &&
      windup.target?.id === state.target?.id &&
      windup.target?.building === state.target?.building;
  if (!target || !same) {
    const stats = superDragonBurstStats(unit.level ?? 1);
    state.shotsLeft = 0;
    delete state.target;
    delete windup.engaged;
    delete windup.target;
    delete windup.animationOffset;
    windup.recovery = stats.afterBurst;
    windup.recoveryAtStart = stats.afterBurst + windup.actionDt;
    windup.remaining = stats.afterBurst + stats.firstHit;
    unit.cooldown = windup.remaining;
    return false;
  }
  if (state.lastAt !== at) {
    state.remaining -= windup.actionDt;
    state.lastAt = at;
  }
  const stats = superDragonBurstStats(unit.level ?? 1);
  while (state.shotsLeft && state.remaining <= 1e-9) {
    const launched = rate > 0 ? at + Math.min(0, state.remaining) / rate : at;
    release(target, launched);
    state.remaining += stats.delay;
    state.shotsLeft--;
  }
  unit.attacking = true;
  return true;
}
