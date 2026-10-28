import { BUILDINGS, TROOPS } from './data';
import { chainRef, resolveChainTarget, type ChainRef, type ChainTarget } from './chain-targets';
import { nearestAlertedDefender, preferredHeroTarget, preferredOrCommitted } from './defenders';
import { distance2D } from './distance';
import { splitTiming } from './garrison-kinds';
import { targetableBuilding } from './hidden-tesla';
import { nativeUnitRow, type NativeUnitStats } from './native-units';
import { unitAttackIntervalScale } from './native-status';
import type { Battle, Unit } from './model';
import type { NativeTroopContext } from './native-troops';

interface BowlerAudioCharge {
  key: string;
  age: number;
  lastAt: number;
  waiting?: true;
}
export interface NativeAttackWindupState {
  remaining: number;
  recovery: number;
  recoveryAtStart: number;
  actionDt: number;
  lastAt: number;
  engaged?: true;
  target?: ChainRef;
  /** Seconds relative to the original ActionFrame: windup before it, follow-through after. */
  animationOffset?: number;
  /** Version 159: presentation only; active wall time is independent of attack-speed scaling. */
  audio?: {
    dt: number;
    sequence: number;
    charge?: BowlerAudioCharge;
    history?: { key: string; at: number }[];
  };
}
const state = (unit: Unit): NativeAttackWindupState =>
  ((unit.native ??= {})[unit.kind === 'bowler' ? 'bowler' : 'attackWindup'] ??= {
    remaining: 0,
    recovery: 0,
    recoveryAtStart: 0,
    actionDt: 0,
    lastAt: 0,
  });

function resolve(
  ctx: NativeTroopContext,
  ref: ChainRef,
  airTargets: boolean,
): ChainTarget | undefined {
  if (!ref.building) {
    const target = resolveChainTarget(ctx, ref, ctx.battle.elapsed);
    return target && 'defender' in target && (target.defender.mode === 'ground' || airTargets)
      ? target
      : undefined;
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
function pose(unit: Unit, st: NativeAttackWindupState, stats: NativeUnitStats) {
  const timing = splitTiming(nativeUnitRow(unit.kind, stats.level));
  st.animationOffset = st.engaged
    ? st.recovery > 1e-9
      ? timing.recovery - st.recovery
      : -st.remaining
    : undefined;
}

/** Active samples pause with Freeze; completed takes keep their natural one-shot tails. */
function advanceAudio(unit: Unit, st: NativeAttackWindupState, at: number, initialAge?: number) {
  const audio = st.audio;
  if (!audio) return;
  if (!st.engaged || !st.target) {
    delete audio.charge;
    return;
  }
  const start = (age: number): BowlerAudioCharge => ({
    key: `troop:${unit.id}:preAttack:${++audio.sequence}`,
    age,
    lastAt: at,
  });
  if (initialAge !== undefined) audio.charge = { ...start(initialAge), waiting: true };
  if (st.recovery > 1e-9) {
    if (!audio.charge?.waiting) delete audio.charge;
    return;
  }
  const active =
    audio.dt * (st.actionDt > 0 ? Math.max(0, 1 - st.recoveryAtStart / st.actionDt) : 0);
  if (active <= 1e-9) return;
  const charge = (audio.charge ??= start(0));
  charge.age += active;
  charge.lastAt = at;
  delete charge.waiting;
}
function releaseAudio(st: NativeAttackWindupState, at: number) {
  const audio = st.audio,
    charge = audio?.charge;
  if (!audio || !charge || charge.waiting) return;
  const history = (audio.history ??= []);
  history.push({ key: charge.key, at: at - charge.age });
  if (history.length > 16) history.splice(0, history.length - 16);
  delete audio.charge;
}

/** Advances active attack time once; the normal ground router handles unfinished chases. */
export function stepNativeAttackWindup(
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
  if (unit.kind === 'bowler' && ctx.battle.nativeBowlerPreAttack)
    (st.audio ??= { dt: 0, sequence: 0 }).dt = dt * active;
  st.actionDt = (actionDt * active) / unitAttackIntervalScale(unit, at);
  st.recoveryAtStart = st.recovery;
  st.recovery = Math.max(0, st.recovery - st.actionDt);
  if (st.engaged) st.remaining -= st.actionDt;
  st.lastAt = at;
  unit.cooldown = Math.max(0, st.engaged ? st.remaining : st.recovery);
  const airTargets =
    stats.airTargets &&
    !!(
      (ctx.battle.nativeWitchWindup && (unit.kind === 'witch' || unit.kind === 'superwitch')) ||
      (ctx.battle.nativeElectroTitanWindup && unit.kind === 'electrotitan') ||
      (ctx.battle.nativeApprenticeWindup && unit.kind === 'apprenticewarden') ||
      (ctx.battle.nativeHeadhunterWindup && unit.kind === 'headhunter') ||
      (ctx.battle.nativeThrowerWindup && unit.kind === 'thrower') ||
      (ctx.battle.nativeDragonRiderWindup && unit.kind === 'dragonrider') ||
      (ctx.battle.nativeBabyDragonWindup && unit.kind === 'babydragon') ||
      (ctx.battle.nativeSuperMinionLongShots && unit.kind === 'superminion') ||
      (ctx.battle.nativeMinionWindup && unit.kind === 'minion')
    );
  const target = st.target && resolve(ctx, st.target, airTargets);
  const traits = {
    ...TROOPS[unit.kind],
    airTargets,
    ...(ctx.battle.nativeHeadhunterWindup && unit.kind === 'headhunter'
      ? { preferHeroes: stats.preferHeroes }
      : {}),
    ...(unit.kind !== 'bowler'
      ? {
          prefersDefenses:
            stats.preferredClass === 'Defense' || !!stats.preferredBuilding || undefined,
          prefersResources: stats.preferredClass === 'Resource' || undefined,
        }
      : {}),
  };
  const wantsBuilding =
    target &&
    unit.kind !== 'bowler' &&
    (traits.prefersDefenses || traits.prefersResources) &&
    preferredOrCommitted(
      ctx.battle,
      unit,
      traits,
      ctx.buildings,
      ctx.isTargetable ?? ((building) => targetableBuilding(ctx.battle, building)),
    );
  const candidate =
    target && 'building' in target && !wantsBuilding
      ? nearestAlertedDefender(ctx.battle, unit, traits)
      : undefined;
  const committedWall =
    target &&
    'building' in target &&
    target.building.kind === 'wall' &&
    (unit.kind !== 'bowler' || !!ctx.battle.nativeBowlerWallWindup);
  const retaliate =
    candidate &&
    (!committedWall ||
      distance2D(candidate.x - unit.x, candidate.y - unit.y) <= stats.range + 1e-6);
  const preferredHero =
    'preferHeroes' in traits && traits.preferHeroes
      ? preferredHeroTarget(ctx.battle, unit, traits)
      : undefined;
  const heroInterrupt =
    preferredHero && target && ('building' in target || target.defender.id !== preferredHero.id);
  if (!target || heroInterrupt || retaliate || ('defender' in target && wantsBuilding)) {
    delete st.engaged;
    delete st.target;
    delete st.animationOffset;
    unit.cooldown = st.recovery;
    advanceAudio(unit, st, at);
    return false;
  }
  const distance = gap(unit, target);
  if (ctx.battle.nativeMinerWindup && unit.kind === 'miner' && distance > stats.range + 1e-6) {
    // Reburrowing ends the exposed swing; emergence must begin a fresh charge.
    delete st.engaged;
    delete st.animationOffset;
    unit.cooldown = st.recovery;
    return false;
  }
  if (st.recovery > 1e-9) {
    if (distance > stats.range + 1e-6) {
      delete st.engaged;
      delete st.animationOffset;
    }
    pose(unit, st, stats);
    advanceAudio(unit, st, at);
    return false;
  }
  pose(unit, st, stats);
  advanceAudio(unit, st, at);
  if (!st.engaged) return false;
  if (st.remaining > 1e-9) {
    if (distance > stats.range + 1e-6) return false;
    unit.attacking = true;
    return true;
  }
  const overshoot = Math.min(0, st.remaining),
    timing = splitTiming(nativeUnitRow(unit.kind, stats.level));
  unit.attacking = true;
  releaseAudio(st, at);
  release(target);
  st.remaining = timing.period + overshoot;
  st.recovery = Math.max(0, timing.recovery + overshoot);
  unit.cooldown = st.remaining;
  pose(unit, st, stats);
  return true;
}

/** A fresh in-range target starts with the source initial charge, after recovery left. */
export function beginNativeAttackWindup(
  unit: Unit,
  stats: NativeUnitStats,
  target: ChainTarget,
  battle?: Battle,
) {
  const st = state(unit),
    ref = chainRef(target);
  if (!st.engaged || st.target?.id !== ref.id || st.target.building !== ref.building) {
    const timing = splitTiming(nativeUnitRow(unit.kind, stats.level));
    st.target = ref;
    st.engaged = true;
    st.remaining = st.recoveryAtStart + timing.firstHit - st.actionDt;
    unit.cooldown = Math.max(0, st.remaining);
    pose(unit, st, stats);
    if (unit.kind === 'bowler' && battle?.nativeBowlerPreAttack)
      advanceAudio(unit, st, battle.elapsed, timing.charge);
  }
}
