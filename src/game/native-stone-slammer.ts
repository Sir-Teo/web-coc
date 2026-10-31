import { BUILDINGS, isTrap } from './data';
import { chainPoint, type ChainTarget } from './chain-targets';
import { hurtDefender } from './defenders';
import { distance2D } from './distance';
import { distanceTo } from './model';
import { num, seconds, tiles } from './native-data';
import { nativeUnitRow, type NativeUnitStats } from './native-units';
import type { NativeTroopContext } from './native-troops';
import type { Unit } from './model';

const cache = new Map<number, ReturnType<typeof resolveStats>>();
function resolveStats(level: number) {
  const row = nativeUnitRow('stoneslammer', level);
  if (seconds(row, 'Damage2Delay') !== 0) throw Error('Unsupported delayed Stone Slammer blast');
  return {
    maximum: num(row, 'Damage2'),
    minimum: num(row, 'Damage2Min'),
    radius: tiles(row, 'Damage2Radius'),
    falloffStart: tiles(row, 'Damage2FalloffStart'),
    falloffEnd: tiles(row, 'Damage2FalloffEnd'),
  };
}
export function stoneSlammerSecondaryStats(level: number) {
  let result = cache.get(level);
  if (!result) cache.set(level, (result = resolveStats(level)));
  return result;
}
export function stoneSlammerSecondaryDamage(level: number, distance: number) {
  const s = stoneSlammerSecondaryStats(level);
  if (distance > s.radius + 1e-9) return 0;
  const span = s.falloffEnd - s.falloffStart,
    fraction = span > 0 ? Math.max(0, Math.min(1, (distance - s.falloffStart) / span)) : 0;
  return s.maximum + (s.minimum - s.maximum) * fraction;
}

/** Two simultaneous ground blasts, using the existing footprint-distance convention. */
export function attackStoneSlammer(
  ctx: NativeTroopContext,
  unit: Unit,
  stats: NativeUnitStats,
  damage: number,
  target: ChainTarget,
) {
  const secondary = stoneSlammerSecondaryStats(stats.level),
    center = chainPoint(target),
    scale = damage / stats.damage,
    at = ctx.battle.elapsed,
    power = (distance: number) =>
      (distance <= stats.splash + 1e-9 ? damage : 0) +
      stoneSlammerSecondaryDamage(stats.level, distance) * scale;
  for (const building of ctx.buildings) {
    if (building.hp <= 0 || isTrap(building.kind)) continue;
    const base = power(distanceTo(center, building));
    if (base <= 0) continue;
    // Retain the character's existing Wall multiplier for both blast components.
    const multiplier =
      BUILDINGS[building.kind].name === stats.damageMultiplierTarget ? stats.damageMultiplier : 1;
    ctx.damageBuilding(building, base * multiplier, at);
  }
  for (const defender of ctx.battle.defenders ?? []) {
    if (defender.hp <= 0 || defender.mode !== 'ground' || defender.spawnedAt > at + 1e-9) continue;
    const base = power(distance2D(defender.x - center.x, defender.y - center.y));
    if (base > 0) hurtDefender(ctx.battle, defender, base, at);
  }
  const state = unit.native!;
  state.lastAttackAt = at;
  state.attacks = (state.attacks ?? 0) + 1;
  ctx.effect({
    type: 'blast',
    x: center.x,
    y: center.y,
    radius: secondary.radius,
    sourceId: unit.id,
  });
}
