import { BUILDINGS } from './data';
import { hurtDefender, type Defender } from './defenders';
import { defenderHidden } from './defender-visibility';
import { garrisonDefenderTargetable } from './garrison-abilities';
import { targetableBuilding } from './hidden-tesla';
import { nativeRow, num, seconds, tiles } from './native-data';
import { buildingEffects } from './native-status';
import { nativeUnitStats } from './native-units';
import type { Building, Unit } from './model';
import type { NativeTroopContext } from './native-troops';

type Point = { x: number; y: number };
type Target = { building: Building } | { defender: Defender };
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
const id = (target: Target) =>
  'building' in target ? `building:${target.building.id}` : `defender:${target.defender.id}`;
const order = (a: Target, b: Target) =>
  'building' in a
    ? 'building' in b
      ? a.building.id - b.building.id
      : -1
    : 'building' in b
      ? 1
      : a.defender.id - b.defender.id;
const point = (target: Target): Point =>
  'building' in target
    ? {
        x: target.building.x + BUILDINGS[target.building.kind].size / 2,
        y: target.building.y + BUILDINGS[target.building.kind].size / 2,
      }
    : target.defender;
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

/** Nearest eligible target at each hop; edge distance and stable ids match the shared chain adapter. */
function nextTarget(ctx: NativeTroopContext, arc: ElectromiteArc): Target | undefined {
  const { ability } = rules(arc.level),
    radius = tiles(ability, 'ChainAttackDistance');
  let nearest: Target | undefined,
    best = Infinity;
  const consider = (target: Target, distance: number) => {
    if (arc.hit.includes(id(target)) || distance > radius + EPS) return;
    if (
      distance < best - EPS ||
      (Math.abs(distance - best) <= EPS && (!nearest || order(target, nearest) < 0))
    ) {
      nearest = target;
      best = distance;
    }
  };
  for (const b of ctx.buildings) {
    if (b.kind === 'wall' || !targetableBuilding(ctx.battle, b)) continue;
    const size = BUILDINGS[b.kind].size;
    consider(
      { building: b },
      Math.hypot(
        Math.max(b.x - arc.x, 0, arc.x - b.x - size),
        Math.max(b.y - arc.y, 0, arc.y - b.y - size),
      ),
    );
  }
  for (const d of ctx.battle.defenders ?? []) {
    if (
      d.hp <= 0 ||
      d.spawnedAt > arc.at + EPS ||
      (d.invisibleUntil ?? 0) > arc.at + EPS ||
      defenderHidden(ctx.battle, d) ||
      !garrisonDefenderTargetable(ctx.battle, d)
    )
      continue;
    consider({ defender: d }, Math.hypot(d.x - arc.x, d.y - arc.y));
  }
  return nearest;
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
    const target = nextTarget(ctx, arc);
    if (target) strike(ctx, arc, target, false);
  }
  battle.nativeElectromiteArcs = pending;
  battle.nativeElectromiteZaps = (battle.nativeElectromiteZaps ?? []).filter(
    (z) => z.at + ELECTROMITE_EFFECT_LIFETIME >= battle.elapsed - EPS,
  );
}
