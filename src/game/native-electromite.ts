import {
  chainKey as id,
  chainPoint as point,
  nearestChainTarget,
  type ChainTarget as Target,
} from './chain-targets';
import { hurtDefender } from './defenders';
import { nativeRow, num, seconds, tiles } from './native-data';
import { buildingEffects } from './native-status';
import { nativeUnitStats } from './native-units';
import type { Unit } from './model';
import type { NativeTroopContext } from './native-troops';

type Point = { x: number; y: number };
export interface ElectromiteArc extends Point {
  key: string;
  sourceId: number;
  level: number;
  at: number;
  damage: number;
  remaining: number;
  hit: string[];
  fromAir: boolean;
}
/** Captured source/target points survive the one-use caster and replay seeks. */
export interface ElectromiteZap {
  key: string;
  sourceId: number;
  level: number;
  at: number;
  primary: boolean;
  fromX: number;
  fromY: number;
  fromAir: boolean;
  x: number;
  y: number;
  toAir: boolean;
  targetId: number;
  targetBuilding: boolean;
}
const EPS = 1e-9;
export const ELECTROMITE_EFFECT_LIFETIME = 10;
const rules = (level: number) => {
  const s = nativeUnitStats('electromite', level);
  return { stats: s, ability: nativeRow('abilities', s.ability, s.abilityLevel) };
};
function strike(ctx: NativeTroopContext, arc: ElectromiteArc, target: Target, primary: boolean) {
  const { battle } = ctx,
    { stats, ability } = rules(arc.level),
    to = point(target),
    stun = seconds(ability, 'FrostOnHitTime');
  const zap: ElectromiteZap = {
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
    targetId: 'building' in target ? target.building.id : target.defender.id,
    targetBuilding: 'building' in target,
  };
  (battle.nativeElectromiteZaps ??= []).push(zap);
  if ('building' in target) {
    const b = target.building;
    // The character and ability repeat the same x4 building bonus; it applies once.
    ctx.damageBuilding(b, arc.damage * stats.preferredMultiplier, arc.at);
    if (b.hp > 0 && stun > 0) {
      const e = buildingEffects(battle, b);
      e.stunUntil = Math.max(e.stunUntil ?? 0, arc.at + stun);
      battle.defenseStuns[b.id] = Math.max(battle.defenseStuns[b.id] ?? 0, arc.at + stun);
      delete battle.defenseTargets[b.id];
    }
  } else {
    const d = target.defender;
    hurtDefender(battle, d, arc.damage, arc.at);
    if (d.hp > 0 && stun > 0) d.stunnedUntil = Math.max(d.stunnedUntil ?? 0, arc.at + stun);
  }
  const remaining = arc.remaining - 1;
  if (remaining > 0)
    (battle.nativeElectromiteArcs ??= []).push({
      ...arc,
      x: to.x,
      y: to.y,
      fromAir: zap.toAir,
      at: arc.at + seconds(ability, 'ChainAttackDelay'),
      damage: arc.damage * (1 - num(ability, 'ChainAttackDamageReductionPercent') / 100),
      remaining,
      hit: [...arc.hit, id(target)],
    });
}

/** One source cast: no flight projectile; the body dissipates after committing the first zap. */
export function attackElectromite(
  ctx: NativeTroopContext,
  unit: Unit,
  damage: number,
  target: Target,
) {
  const s = nativeUnitStats('electromite', unit.level ?? 1),
    { ability } = rules(s.level),
    state = (unit.native ??= {});
  strike(
    ctx,
    {
      key: `electromite:${unit.id}:${state.attacks ?? 0}`,
      sourceId: unit.id,
      level: s.level,
      x: unit.x,
      y: unit.y,
      fromAir: false,
      at: ctx.battle.elapsed,
      damage,
      remaining: num(ability, 'ChainAttackDepth'),
      hit: [],
    },
    target,
    true,
  );
  state.lastAttackAt = ctx.battle.elapsed;
  state.attacks = (state.attacks ?? 0) + 1;
  unit.hp = 0;
  unit.spent = true;
  unit.defeatedAt = ctx.battle.elapsed;
}

export function stepElectromiteArcs(ctx: NativeTroopContext) {
  const battle = ctx.battle;
  if (
    !battle.nativeElectromites ||
    (!battle.nativeElectromiteArcs && !battle.nativeElectromiteZaps)
  )
    return;
  const pending: ElectromiteArc[] = [];
  // Each new hop joins the same time-ordered queue, including during a late update.
  const queue = battle.nativeElectromiteArcs ?? [];
  battle.nativeElectromiteArcs = queue;
  while (queue.length) {
    queue.sort((a, b) => a.at - b.at || a.sourceId - b.sourceId);
    const arc = queue.shift()!;
    if (arc.at > battle.elapsed + EPS) {
      pending.push(arc, ...queue);
      break;
    }
    const target = nearestChainTarget(
      ctx,
      arc,
      tiles(rules(arc.level).ability, 'ChainAttackDistance'),
      arc.hit,
      arc.at,
    );
    if (target) strike(ctx, arc, target, false);
  }
  battle.nativeElectromiteArcs = pending;
  battle.nativeElectromiteZaps = (battle.nativeElectromiteZaps ?? []).filter(
    (z) => z.at + ELECTROMITE_EFFECT_LIFETIME >= battle.elapsed - EPS,
  );
}
