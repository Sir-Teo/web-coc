import type { Unit } from './model';
import type { NativeTroopContext } from './native-troops';
import { nativeUnitStats, type NativeUnitStats } from './native-units';
import { launchProjectile, type CombatProjectile } from './projectiles';
import { healingEligible } from './friendly-unit';
import { healUnit } from './native-status';
import { healerContribution } from './healing';
import { nativeRow, tiles } from './native-data';
import { TROOPS } from './data';
import { distance2D } from './distance';

export function launchNativeHealing(
  ctx: NativeTroopContext,
  unit: Unit,
  stats: NativeUnitStats,
  target: Unit,
  amount: number,
) {
  return launchProjectile(
    ctx.battle,
    {
      weapon: 'native',
      native: {
        name: stats.projectile,
        kind: unit.kind,
        level: stats.level,
        healing: { remaining: stats.bounces, hit: [unit.id, target.id] },
      },
      sourceId: unit.id,
      targetId: target.id,
      targetBuilding: false,
      fromX: unit.x,
      fromY: unit.y,
      x: target.x,
      y: target.y,
      fromAir: stats.flying,
      toAir: !!TROOPS[target.kind].flying,
      damage: amount,
    },
    ctx.effect,
  );
}

/** Positive recovery stays on the friendly side and keeps the original caster tier through flight. */
export function resolveNativeHealing(ctx: NativeTroopContext, projectile: CombatProjectile) {
  const source = projectile.native,
    healing = source?.healing;
  if (!ctx.battle.nativeHealingProjectiles || !source || !healing) return false;
  const battle = ctx.battle;
  const target = battle.units.find((u) => u.id === projectile.targetId);
  if (!target || !healingEligible(battle, target, projectile.impact)) return true;
  const stats = nativeUnitStats(source.kind, source.level);
  const scale = target.hero ? stats.heroMultiplier : 1;
  const contribution =
    source.kind === 'unicorn' ? healerContribution(battle, target, projectile.sourceId) : 1;
  healUnit(battle, target, projectile.damage * scale * contribution, projectile.impact);
  if (healing.remaining <= 0) return true;
  const reach = tiles(nativeRow('projectiles', source.name), 'MaxBounceDistance');
  let next: Unit | undefined,
    nearest = Infinity;
  for (const candidate of battle.units) {
    if (
      !healingEligible(battle, candidate, projectile.impact) ||
      candidate.hp >= candidate.maxHp ||
      healing.hit.includes(candidate.id)
    )
      continue;
    const air = !!TROOPS[candidate.kind].flying;
    if (air ? !stats.airTargets : !stats.groundTargets) continue;
    const distance = distance2D(candidate.x - target.x, candidate.y - target.y);
    if (distance > reach + 1e-9) continue;
    if (distance < nearest || (distance === nearest && candidate.id < next!.id)) {
      next = candidate;
      nearest = distance;
    }
  }
  if (!next) return true;
  launchProjectile(
    battle,
    {
      weapon: 'native',
      native: {
        ...source,
        bounce: (source.bounce ?? 0) + 1,
        healing: { remaining: healing.remaining - 1, hit: [...healing.hit, next.id] },
      },
      sourceId: projectile.sourceId,
      targetId: next.id,
      targetBuilding: false,
      fromX: target.x,
      fromY: target.y,
      x: next.x,
      y: next.y,
      fromAir: !!TROOPS[target.kind].flying,
      toAir: !!TROOPS[next.kind].flying,
      damage: projectile.damage,
    },
    ctx.effect,
    projectile.impact,
  );
  return true;
}
