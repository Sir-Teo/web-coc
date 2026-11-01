import { burstGap } from './native-burst-timing';
import { splitTiming } from './garrison-kinds';
import { nativeUnitRow, nativeUnitStats } from './native-units';
import { num, seconds } from './native-data';
import {
  chainPoint,
  chainRef,
  resolveChainTarget,
  type ChainRef,
  type ChainTarget,
} from './chain-targets';
import type { Unit } from './model';
import type { NativeTroopContext } from './native-troops';
import { launchProjectile } from './projectiles';

const cache = new Map<number, ReturnType<typeof resolveStats>>();
function resolveStats(level: number) {
  const stats = nativeUnitStats('flameflinger', level),
    row = nativeUnitRow('flameflinger', stats.level),
    count = num(row, 'BurstCount'),
    delay = seconds(row, 'BurstDelay'),
    gap = burstGap(stats.rate),
    firstHit = burstGap(splitTiming(row).firstHit),
    period = gap + (count - 1) * delay;
  if (count < 2 || delay <= 0 || firstHit <= 0 || gap < firstHit)
    throw Error('Unsupported Flame Flinger burst');
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
export function flameFlingerBurstStats(level: number) {
  let result = cache.get(level);
  if (!result) cache.set(level, (result = resolveStats(level)));
  return result;
}

export interface FlameFlingerBurstState {
  shotsLeft: number;
  remaining: number;
  lastAt: number;
  target?: ChainRef;
}
export function prepareFlameFlingerBurst(unit: Unit, at: number) {
  return ((unit.native ??= {}).flameFlingerBurst ??= { shotsLeft: 0, remaining: 0, lastAt: at });
}
/** The first shot shares the attack controller's fractional charge remainder. */
export function beginFlameFlingerBurst(
  unit: Unit,
  level: number,
  target: ChainTarget,
  at: number,
  rate: number,
) {
  const state = prepareFlameFlingerBurst(unit, at),
    stats = flameFlingerBurstStats(level),
    overshoot = Math.min(0, unit.native!.attackWindup!.remaining);
  state.shotsLeft = stats.count - 1;
  state.remaining = stats.delay + overshoot;
  state.lastAt = at;
  state.target = chainRef(target);
  return rate > 0 ? at + overshoot / rate : at;
}
/** Remaining shots advance in active attack time; loss of the target cancels the take. */
export function stepFlameFlingerBurst(
  ctx: NativeTroopContext,
  unit: Unit,
  rate: number,
  release: (target: ChainTarget, at: number) => void,
) {
  const state = unit.native!.flameFlingerBurst!,
    windup = unit.native!.attackWindup!,
    at = ctx.battle.elapsed;
  if (!state.shotsLeft) return false;
  const target = state.target && resolveChainTarget(ctx, state.target, at),
    same =
      windup.engaged &&
      windup.target?.id === state.target?.id &&
      windup.target?.building === state.target?.building;
  if (!target || !same) {
    const stats = flameFlingerBurstStats(unit.level ?? ctx.troopLevel('flameflinger'));
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
  const stats = flameFlingerBurstStats(unit.level ?? ctx.troopLevel('flameflinger'));
  while (state.shotsLeft && state.remaining <= 1e-9) {
    const launched = rate > 0 ? at + Math.min(0, state.remaining) / rate : at;
    release(target, launched);
    state.remaining += stats.delay;
    state.shotsLeft--;
  }
  unit.attacking = true;
  return true;
}

/** Each shot captures a ground aim and its own physical release time. */
export function releaseFlameFlingerShot(
  ctx: NativeTroopContext,
  unit: Unit,
  stats: ReturnType<typeof nativeUnitStats>,
  damage: number,
  target: ChainTarget,
  at: number,
) {
  const point = chainPoint(target),
    building = 'building' in target;
  launchProjectile(
    ctx.battle,
    {
      weapon: 'native',
      native: { name: stats.projectile, kind: unit.kind, level: stats.level, captureSource: true },
      sourceId: unit.id,
      targetId: building ? target.building.id : target.defender.id,
      targetBuilding: building,
      ...(!building ? { targetDefender: true } : {}),
      fromX: unit.x,
      fromY: unit.y,
      x: point.x,
      y: point.y,
      fromAir: false,
      toAir: false,
      damage,
      splash: stats.splash,
    },
    ctx.effect,
    at,
  );
  const state = unit.native!;
  state.lastAttackAt = at;
  state.attacks = (state.attacks ?? 0) + 1;
}
