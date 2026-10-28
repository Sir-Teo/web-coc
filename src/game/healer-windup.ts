import type { Battle, Unit } from './model';
import { splitTiming } from './garrison-kinds';
import { nativeUnitRow } from './native-units';
import { unitAttackIntervalScale } from './native-status';

/** Friendly targets never occupy the enemy building/defender namespace. */
export interface HealerWindupState {
  remaining: number;
  recovery: number;
  recoveryAtStart: number;
  actionDt: number;
  targetId?: number;
  engaged?: true;
  animationOffset?: number;
}
const timing = (battle: Battle, unit: Unit) =>
  splitTiming(nativeUnitRow('healer', unit.level ?? battle.troopLevels?.healer ?? 1));
function pose(battle: Battle, unit: Unit) {
  const st = unit.native!.healerWindup!;
  st.animationOffset = st.engaged
    ? st.recovery > 1e-9
      ? timing(battle, unit).recovery - st.recovery
      : -st.remaining
    : undefined;
}
/** Advance active time once, including the active fraction of a thawing sample. */
export function advanceHealerWindup(battle: Battle, unit: Unit, dt: number, actionDt: number) {
  const st = ((unit.native ??= {}).healerWindup ??= {
    remaining: 0,
    recovery: 0,
    recoveryAtStart: 0,
    actionDt: 0,
  });
  const hold = Math.max(
    unit.native!.effects?.frozenUntil ?? 0,
    unit.native!.effects?.stunUntil ?? 0,
  );
  const active = dt > 0 ? Math.min(1, Math.max(0, battle.elapsed - hold) / dt) : 1;
  st.actionDt = (actionDt * active) / unitAttackIntervalScale(unit, battle.elapsed);
  st.recoveryAtStart = st.recovery;
  st.recovery = Math.max(0, st.recovery - st.actionDt);
  if (st.engaged) st.remaining -= st.actionDt;
  unit.cooldown = Math.max(0, st.engaged ? st.remaining : st.recovery);
  pose(battle, unit);
  return st;
}
export function cancelHealerWindup(unit: Unit) {
  const st = unit.native?.healerWindup;
  if (!st) return;
  delete st.engaged;
  delete st.targetId;
  delete st.animationOffset;
  unit.cooldown = st.recovery;
}
export function beginHealerWindup(battle: Battle, unit: Unit, targetId: number) {
  const st = unit.native!.healerWindup!;
  if (!st.engaged || st.targetId !== targetId) {
    st.targetId = targetId;
    st.engaged = true;
    st.remaining = st.recoveryAtStart + timing(battle, unit).firstHit - st.actionDt;
    unit.cooldown = Math.max(0, st.remaining);
    pose(battle, unit);
  }
}
export function releaseHealerWindup(battle: Battle, unit: Unit) {
  const st = unit.native!.healerWindup!,
    t = timing(battle, unit),
    overshoot = Math.min(0, st.remaining);
  st.remaining = t.period + overshoot;
  st.recovery = Math.max(0, t.recovery + overshoot);
  unit.cooldown = st.remaining;
  pose(battle, unit);
}
