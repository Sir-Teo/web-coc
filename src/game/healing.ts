import { distance2D, distanceSquared2D } from './distance';
import { TROOPS } from './data';
import type { Battle, Unit } from './model';
import { launchProjectile } from './projectiles';
import type { FX } from './model';

/** Supercell's HEAL_STACK_PERCENT and Healer records; see docs/LATE-TROOPS.md. */
export const HEALER_STACK = [1, 1, 0.9, 0.9, 0.7, 0.4, 0.1, 0] as const;
export const HEALER_HERO_SCALE = 0.55;
export const HEALER_RADIUS = 1.5;
const HEALER_RADIUS_SQ = HEALER_RADIUS * HEALER_RADIUS;
const groundAlly = (u: Unit) => u.hp > 0 && !TROOPS[u.kind].flying;
const distance = (a: Unit, b: Unit) => distance2D(a.x - b.x, a.y - b.y);
const distanceSq = (a: Unit, b: Unit) => distanceSquared2D(a.x - b.x, a.y - b.y);

/** Choose before movement so healers in the same update see the same group. */
export function prepareHealerTargets(battle: Battle) {
  const allies = battle.units.filter(groundAlly);
  if (!allies.length) return;
  // Cluster housing once per tick (O(A²)), not once per healer (O(H·A²)).
  const clusterSpace = new Map<number, number>();
  for (const target of allies) {
    let space = 0;
    for (const u of allies)
      if (distanceSquared2D(u.x - target.x, u.y - target.y) <= HEALER_RADIUS_SQ)
        space += TROOPS[u.kind].space;
    clusterSpace.set(target.id, space);
  }
  for (const healer of battle.units) {
    if (!TROOPS[healer.kind].healer || healer.hp <= 0) continue;
    if (allies.some((u) => u.id === healer.healTarget)) continue;
    const candidates = allies.filter(
      (target) => target.hero || (clusterSpace.get(target.id) ?? 0) > 2,
    );
    // Retain a living target. On acquisition, favor an injured ally at a similar distance.
    candidates.sort(
      (a, b) =>
        distance(healer, a) +
          (a.hp < a.maxHp ? 0 : 0.75) -
          (distance(healer, b) + (b.hp < b.maxHp ? 0 : 0.75)) || a.id - b.id,
    );
    healer.healTarget = candidates[0]?.id;
    healer.target = null;
    healer.path = [];
  }
}

export function stepHealer(
  battle: Battle,
  healer: Unit,
  stats: { speed: number; range: number; rate: number; heal?: number },
  dt: number,
  emit: (fx: FX) => void,
) {
  const target = battle.units.find((u) => u.id === healer.healTarget && groundAlly(u));
  if (!target) return;
  const range = distance(healer, target);
  if (range > stats.range + 1e-9) {
    const move = Math.min(stats.speed * dt, range - stats.range);
    healer.x += ((target.x - healer.x) / range) * move;
    healer.y += ((target.y - healer.y) / range) * move;
    return;
  }
  healer.attacking = true;
  if (healer.cooldown > 0) return;
  healer.cooldown = stats.rate;
  launchProjectile(
    battle,
    {
      weapon: 'healing',
      sourceId: healer.id,
      targetId: target.id,
      targetBuilding: false,
      fromX: healer.x,
      fromY: healer.y,
      x: target.x,
      y: target.y,
      fromAir: true,
      damage: stats.heal ?? 0,
      splash: HEALER_RADIUS,
    },
    emit,
  );
}

/** Stable source order applies the native marginal stacking curve to each recipient. */
export function healerContribution(battle: Battle, recipient: Unit, sourceId: number) {
  const byId = new Map<number, Unit>();
  for (const u of battle.units) byId.set(u.id, u);
  const sources = new Set([sourceId]);
  for (const healer of battle.units) {
    if (!TROOPS[healer.kind].healer || healer.hp <= 0) continue;
    const target = byId.get(healer.healTarget ?? -1);
    if (!target || !groundAlly(target)) continue;
    const healerRange = TROOPS.healer.range + 1e-9;
    if (
      target &&
      distanceSq(healer, target) <= healerRange * healerRange &&
      distanceSq(target, recipient) <= HEALER_RADIUS_SQ
    )
      sources.add(healer.id);
  }
  // A launched pulse remains a contributor if its source dies before landing.
  for (const shot of battle.projectiles ?? [])
    if (
      shot.weapon === 'healing' &&
      distance2D(shot.x - recipient.x, shot.y - recipient.y) <= HEALER_RADIUS
    )
      sources.add(shot.sourceId);
  const rank = [...sources].sort((a, b) => a - b).indexOf(sourceId);
  return HEALER_STACK[Math.min(rank, HEALER_STACK.length - 1)];
}
