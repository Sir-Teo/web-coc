import { distance2D } from './distance';
import { BUILDINGS, TROOPS } from './data';
import {
  chainKey,
  chainPoint,
  chainRef,
  resolveChainTarget,
  nearestChainTarget,
  type ChainRef,
  type ChainTarget,
} from './chain-targets';
import { hurtDefender, nearestAlertedDefender } from './defenders';
import { splitTiming } from './garrison-kinds';
import { nativeUnitRow, nativeUnitStats, type NativeUnitStats } from './native-units';
import { unitAttackIntervalScale } from './native-status';
import type { ElectromiteArc, ElectromiteZap } from './native-electromite';
import type { Unit } from './model';
import type { NativeTroopContext } from './native-troops';

export interface ElectroDragonArc extends ElectromiteArc {
  previous?: ChainRef;
}
export interface ElectroDragonZap extends ElectromiteZap {
  fromTarget?: ChainRef;
}
export interface ElectroDragonState {
  clock: number;
  audioClock: number;
  lastAt: number;
  sequence: number;
  recoveryUntil: number;
  animAt?: number;
  charge?: { key: string; target: ChainRef; clockAt: number; audioAt: number; ready: number };
}
const state = (u: Unit, at: number): ElectroDragonState =>
  ((u.native ??= {}).electroDragon ??= {
    clock: 0,
    audioClock: 0,
    lastAt: at,
    sequence: 0,
    recoveryUntil: 0,
  });
export function beginElectroDragonCharge(
  ctx: NativeTroopContext,
  u: Unit,
  s: NativeUnitStats,
  target: ChainTarget,
) {
  const st = state(u, ctx.battle.elapsed),
    timing = splitTiming(nativeUnitRow('electrodragon', s.level));
  st.sequence++;
  st.animAt = st.clock;
  st.charge = {
    key: `electrodragon:${u.id}:${st.sequence}`,
    target: chainRef(target),
    clockAt: st.clock,
    audioAt: st.audioClock,
    ready: st.clock + timing.firstHit,
  };
}
function strike(
  ctx: NativeTroopContext,
  arc: ElectroDragonArc,
  target: ChainTarget,
  primary: boolean,
) {
  const s = nativeUnitStats('electrodragon', arc.level),
    to = chainPoint(target),
    ref = chainRef(target);
  const zap: ElectroDragonZap = {
    key: `${arc.key}:${arc.hit.length}`,
    sourceId: arc.sourceId,
    level: arc.level,
    at: arc.at,
    primary,
    fromX: arc.x,
    fromY: arc.y,
    fromAir: arc.fromAir,
    x: to.x,
    y: to.y,
    toAir: 'defender' in target && target.defender.mode === 'air',
    targetId: ref.id,
    targetBuilding: ref.building,
    ...(arc.previous ? { fromTarget: arc.previous } : {}),
  };
  (ctx.battle.nativeElectroDragonZaps ??= []).push(zap);
  if ('building' in target) ctx.damageBuilding(target.building, arc.damage, arc.at);
  else hurtDefender(ctx.battle, target.defender, arc.damage, arc.at);
  if (arc.remaining > 1)
    (ctx.battle.nativeElectroDragonArcs ??= []).push({
      ...arc,
      x: to.x,
      y: to.y,
      fromAir: zap.toAir,
      previous: ref,
      at: arc.at + s.chainDelay,
      damage: arc.damage * (1 - s.chainReduction),
      remaining: arc.remaining - 1,
      hit: [...arc.hit, chainKey(target)],
    });
}
/** Active action time follows the caller's shrink/poison clocks; native Freeze pauses the charge. */
export function stepElectroDragonCharge(
  ctx: NativeTroopContext,
  u: Unit,
  s: NativeUnitStats,
  damage: number,
  speed: number,
  dt: number,
  actionDt: number,
) {
  const at = ctx.battle.elapsed,
    st = state(u, at),
    effects = u.native?.effects,
    holdUntil = Math.max(effects?.frozenUntil ?? 0, effects?.stunUntil ?? 0),
    active = dt > 0 ? Math.min(1, Math.max(0, at - holdUntil) / dt) : 1;
  st.clock += (actionDt * active) / unitAttackIntervalScale(u, at);
  st.audioClock += dt * active;
  st.lastAt = at;
  u.cooldown = Math.max(0, st.recoveryUntil - st.clock);
  const charge = st.charge;
  if (!charge) return false;
  const target = resolveChainTarget(ctx, charge.target, at);
  const retaliate =
    target &&
    'building' in target &&
    nearestAlertedDefender(ctx.battle, u, { ...TROOPS.electrodragon, airTargets: s.airTargets });
  if (!target || retaliate) {
    delete st.charge;
    delete st.animAt;
    u.attacking = false;
    return false;
  }
  const point = chainPoint(target);
  const measure = ctx.battle.nativeChainGeometry ? distance2D : Math.hypot;
  const gap =
    'building' in target
      ? measure(
          Math.max(
            target.building.x - u.x,
            0,
            u.x - target.building.x - BUILDINGS[target.building.kind].size,
          ),
          Math.max(
            target.building.y - u.y,
            0,
            u.y - target.building.y - BUILDINGS[target.building.kind].size,
          ),
        )
      : measure(point.x - u.x, point.y - u.y);
  if (gap > s.range + 1e-9) {
    const length = measure(point.x - u.x, point.y - u.y),
      travel = Math.min(speed * dt, gap - s.range);
    if (length > 0) {
      u.x += ((point.x - u.x) / length) * travel;
      u.y += ((point.y - u.y) / length) * travel;
    }
  }
  u.attacking = true;
  if (st.clock + 1e-9 >= charge.ready) {
    strike(
      ctx,
      {
        key: charge.key,
        sourceId: u.id,
        level: s.level,
        at,
        damage,
        remaining: s.chainDepth,
        hit: [],
        fromAir: true,
        x: u.x,
        y: u.y,
      },
      target,
      true,
    );
    st.recoveryUntil = charge.ready + splitTiming(nativeUnitRow('electrodragon', s.level)).recovery;
    delete st.charge;
    u.cooldown = Math.max(0, st.recoveryUntil - st.clock);
    (u.native ??= {}).lastAttackAt = at;
    u.native!.attacks = (u.native!.attacks ?? 0) + 1;
  }
  return true;
}
export function stepElectroDragonArcs(ctx: NativeTroopContext) {
  const b = ctx.battle;
  if (!b.nativeElectroDragon || (!b.nativeElectroDragonArcs && !b.nativeElectroDragonZaps)) return;
  const queue = b.nativeElectroDragonArcs ?? [],
    pending: ElectroDragonArc[] = [];
  b.nativeElectroDragonArcs = queue;
  while (queue.length) {
    queue.sort((a, c) => a.at - c.at || a.sourceId - c.sourceId);
    const arc = queue.shift()!;
    if (arc.at > b.elapsed + 1e-9) {
      pending.push(arc, ...queue);
      break;
    }
    const previous = arc.previous ? resolveChainTarget(ctx, arc.previous, arc.at) : undefined;
    const origin = previous ? chainPoint(previous) : arc,
      source = previous ? { ...arc, x: origin.x, y: origin.y } : arc;
    const s = nativeUnitStats('electrodragon', arc.level),
      target = nearestChainTarget(ctx, source, s.chainDistance, arc.hit, arc.at, true);
    if (target) strike(ctx, source, target, false);
  }
  b.nativeElectroDragonArcs = pending;
  b.nativeElectroDragonZaps = (b.nativeElectroDragonZaps ?? []).filter(
    (z) => z.at + 10 >= b.elapsed - 1e-9,
  );
}
