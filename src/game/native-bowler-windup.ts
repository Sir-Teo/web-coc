import { BUILDINGS, TROOPS } from './data';
import { chainRef, resolveChainTarget, type ChainRef, type ChainTarget } from './chain-targets';
import { nearestAlertedDefender } from './defenders';
import { distance2D } from './distance';
import { splitTiming } from './garrison-kinds';
import { targetableBuilding } from './hidden-tesla';
import { nativeUnitRow, type NativeUnitStats } from './native-units';
import { unitAttackIntervalScale } from './native-status';
import type { Unit } from './model';
import type { NativeTroopContext } from './native-troops';

export interface BowlerWindupState {
  remaining: number;
  recovery: number;
  recoveryAtStart: number;
  actionDt: number;
  lastAt: number;
  engaged?: true;
  target?: ChainRef;
  /** Seconds relative to the original ActionFrame: windup before it, follow-through after. */
  animationOffset?: number;
}
const state = (unit: Unit): BowlerWindupState =>
  ((unit.native ??= {}).bowler ??= {
    remaining: 0,
    recovery: 0,
    recoveryAtStart: 0,
    actionDt: 0,
    lastAt: 0,
  });

function resolve(ctx: NativeTroopContext, ref: ChainRef): ChainTarget | undefined {
  if (!ref.building) {
    const target = resolveChainTarget(ctx, ref, ctx.battle.elapsed);
    return target && 'defender' in target && target.defender.mode === 'ground' ? target : undefined;
  }
  const building = ctx.buildingsById.get(ref.id);
  const eligible = ctx.isTargetable ?? ((b) => targetableBuilding(ctx.battle, b));
  return building && building.hp > 0 && eligible(building) ? { building } : undefined;
}
function gap(unit: Unit, target: ChainTarget) {
  if ('defender' in target)
    return distance2D(target.defender.x - unit.x, target.defender.y - unit.y);
  const b = target.building,
    size = BUILDINGS[b.kind].size;
  return distance2D(
    Math.max(b.x - unit.x, 0, unit.x - b.x - size),
    Math.max(b.y - unit.y, 0, unit.y - b.y - size),
  );
}
function pose(st: BowlerWindupState, stats: NativeUnitStats) {
  const timing = splitTiming(nativeUnitRow('bowler', stats.level));
  st.animationOffset = st.engaged
    ? st.recovery > 1e-9
      ? timing.recovery - st.recovery
      : -st.remaining
    : undefined;
}

/** Advances active attack time once; the normal ground router handles unfinished chases. */
export function stepBowlerWindup(
  ctx: NativeTroopContext,
  unit: Unit,
  stats: NativeUnitStats,
  dt: number,
  actionDt: number,
  release: (target: ChainTarget) => void,
) {
  const st = state(unit),
    at = ctx.battle.elapsed,
    hold = Math.max(unit.native?.effects?.frozenUntil ?? 0, unit.native?.effects?.stunUntil ?? 0),
    active = dt > 0 ? Math.min(1, Math.max(0, at - hold) / dt) : 1;
  st.actionDt = (actionDt * active) / unitAttackIntervalScale(unit, at);
  st.recoveryAtStart = st.recovery;
  st.recovery = Math.max(0, st.recovery - st.actionDt);
  if (st.engaged) st.remaining -= st.actionDt;
  st.lastAt = at;
  unit.cooldown = Math.max(0, st.engaged ? st.remaining : st.recovery);
  const target = st.target && resolve(ctx, st.target);
  const retaliate =
    target &&
    'building' in target &&
    nearestAlertedDefender(ctx.battle, unit, { ...TROOPS.bowler, airTargets: false });
  if (!target || retaliate) {
    delete st.engaged;
    delete st.target;
    delete st.animationOffset;
    unit.cooldown = st.recovery;
    return false;
  }
  const distance = gap(unit, target);
  if (st.recovery > 1e-9) {
    if (distance > stats.range + 1e-6) {
      delete st.engaged;
      delete st.animationOffset;
    }
    pose(st, stats);
    return false;
  }
  pose(st, stats);
  if (!st.engaged) return false;
  if (st.remaining > 1e-9) {
    if (distance > stats.range + 1e-6) return false;
    unit.attacking = true;
    return true;
  }
  const overshoot = Math.min(0, st.remaining),
    timing = splitTiming(nativeUnitRow('bowler', stats.level));
  unit.attacking = true;
  release(target);
  st.remaining = timing.period + overshoot;
  st.recovery = Math.max(0, timing.recovery + overshoot);
  unit.cooldown = st.remaining;
  pose(st, stats);
  return true;
}

/** A fresh in-range target starts with the source initial charge, after recovery left. */
export function beginBowlerWindup(unit: Unit, stats: NativeUnitStats, target: ChainTarget) {
  const st = state(unit),
    ref = chainRef(target);
  if (!st.engaged || st.target?.id !== ref.id || st.target.building !== ref.building) {
    const timing = splitTiming(nativeUnitRow('bowler', stats.level));
    st.target = ref;
    st.engaged = true;
    st.remaining = st.recoveryAtStart + timing.firstHit - st.actionDt;
    unit.cooldown = Math.max(0, st.remaining);
    pose(st, stats);
  }
}
