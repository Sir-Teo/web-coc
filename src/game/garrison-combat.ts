import { TROOPS } from './data';
import { distance2D } from './distance';
import { garrisonStats, type GarrisonKind } from './garrison-reserve';
import type { Defender, GarrisonDefender } from './defenders';
import type { Battle, FX, Unit } from './model';

export interface GarrisonAttack {
  at: number;
  x: number;
  y: number;
  targetId: number;
  targetX: number;
  targetY: number;
}

/** The release scheduler supplies the explicit exit point and simulation birth time. */
export function spawnGarrisonDefender(
  battle: Battle,
  kind: GarrisonKind,
  level: number,
  sourceId: number,
  x: number,
  y: number,
  at: number,
): GarrisonDefender {
  const stats = garrisonStats(kind, level);
  const defender: GarrisonDefender = {
    id: -(battle.defenders?.length ?? 0) - 1,
    kind,
    level,
    sourceId,
    mode: 'air',
    x,
    y,
    hp: stats.hp,
    maxHp: stats.hp,
    spawnedAt: at,
    cooldown: 0,
    target: null,
    path: [],
    pathAt: 0,
    attacking: false,
    attacks: [],
  };
  (battle.defenders ??= []).push(defender);
  return defender;
}

function active(unit: Unit, at: number) {
  return unit.hp > 0 && !unit.ejected && (unit.spawnedAt ?? 0) <= at;
}

/** New defender branch only: archived Skeleton state and ordering remain unchanged. */
export function stepGarrisonDefender(
  battle: Battle,
  defender: Defender,
  dt: number,
  effect: (fx: FX) => void,
) {
  if (defender.kind === 'skeleton') return;
  const stats = garrisonStats(defender.kind, defender.level);
  defender.attacking = false;
  if (defender.hp <= 0) {
    if (
      stats.deathDamage &&
      defender.defeatedAt !== undefined &&
      !defender.deathResolved &&
      battle.elapsed + 1e-9 >= defender.defeatedAt + stats.deathDelay
    ) {
      defender.deathResolved = true;
      for (const unit of battle.units)
        if (
          active(unit, defender.defeatedAt + stats.deathDelay) &&
          !TROOPS[unit.kind].flying &&
          distance2D(unit.x - defender.x, unit.y - defender.y) <= stats.deathRadius
        )
          unit.hp = Math.max(0, unit.hp - stats.deathDamage);
      effect({
        type: 'hit',
        sourceDefender: true,
        sourceId: defender.id,
        x: defender.x,
        y: defender.y,
        toX: defender.x,
        toY: defender.y,
        fromAir: true,
        toAir: false,
      });
    }
    return;
  }
  const activeDt = Math.min(
    dt,
    Math.max(0, battle.elapsed - Math.max(defender.spawnedAt, defender.stunnedUntil ?? 0)),
  );
  if (activeDt <= 0) return;
  const eligible = battle.units.filter(
    (unit) =>
      active(unit, battle.elapsed) &&
      (TROOPS[unit.kind].flying ? stats.airTargets : stats.groundTargets),
  );
  const target =
    eligible.find((unit) => unit.id === defender.target) ??
    eligible.sort(
      (a, b) =>
        distance2D(a.x - defender.x, a.y - defender.y) -
          distance2D(b.x - defender.x, b.y - defender.y) || a.id - b.id,
    )[0];
  defender.cooldown = Math.max(0, defender.cooldown - activeDt);
  if (!target) {
    defender.target = null;
    delete defender.engaged;
    return;
  }
  if (defender.target !== target.id) {
    defender.target = target.id;
    delete defender.engaged;
  }
  const distance = distance2D(target.x - defender.x, target.y - defender.y);
  if (distance > stats.range + 1e-6) {
    delete defender.engaged;
    const travel = Math.min(stats.speed * activeDt, distance - stats.range);
    defender.x += ((target.x - defender.x) / distance) * travel;
    defender.y += ((target.y - defender.y) / distance) * travel;
    return;
  }
  if (!defender.engaged) {
    defender.engaged = true;
    defender.cooldown = Math.max(0, stats.firstAttackDelay - activeDt);
  }
  defender.attacking = true;
  if (defender.cooldown > 1e-9) return;
  defender.cooldown = stats.rate;
  defender.alerted = true;
  (defender.attacks ??= []).push({
    at: battle.elapsed,
    x: defender.x,
    y: defender.y,
    targetId: target.id,
    targetX: target.x,
    targetY: target.y,
  });
  const center = stats.selfAsAoeCenter ? defender : target;
  for (const unit of eligible)
    if (
      !!TROOPS[unit.kind].flying === !!TROOPS[target.kind].flying &&
      distance2D(unit.x - center.x, unit.y - center.y) <= stats.splash
    )
      unit.hp = Math.max(0, unit.hp - stats.damage);
  effect({
    type: 'hit',
    sourceDefender: true,
    sourceId: defender.id,
    targetId: target.id,
    x: defender.x,
    y: defender.y,
    toX: target.x,
    toY: target.y,
    fromAir: true,
    toAir: !!TROOPS[target.kind].flying,
  });
}
