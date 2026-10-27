import { launchProjectile, type CombatProjectile } from './projectiles';
import { isTrap } from './data';
import { damageDefenders } from './defenders';
import { distanceTo } from './model';
import type { Defender } from './defenders';
import type { Unit } from './model';
import type { NativeUnitStats } from './native-units';
import type { NativeTroopContext } from './native-troops';

/** Retains the source Witch projectile, splash and target layer at physical release. */
export function releaseWitchAtDefender(
  ctx: NativeTroopContext,
  unit: Unit,
  stats: NativeUnitStats,
  target: Defender,
  damage: number,
) {
  launchProjectile(
    ctx.battle,
    {
      weapon: 'native',
      native: { name: stats.projectile, kind: unit.kind, level: stats.level },
      sourceId: unit.id,
      targetId: target.id,
      targetBuilding: false,
      targetDefender: true,
      fromX: unit.x,
      fromY: unit.y,
      x: target.x,
      y: target.y,
      fromAir: false,
      toAir: target.mode === 'air',
      damage,
      splash: stats.splash || undefined,
    },
    ctx.effect,
  );
  const state = (unit.native ??= {});
  state.lastAttackAt = ctx.battle.elapsed;
  state.attacks = (state.attacks ?? 0) + 1;
}

/** Source DontTrackTarget and area damage: one fixed-point blast on the selected layer. */
export function resolveWitchImpact(ctx: NativeTroopContext, shot: CombatProjectile) {
  if (
    !ctx.battle.nativeWitchWindup ||
    (shot.native?.kind !== 'witch' && shot.native?.kind !== 'superwitch')
  )
    return false;
  if (ctx.battle.nativeWitchSounds) {
    const event = ctx.battle.nativeWitchShots?.find((event) => event.id === shot.id);
    if (event) event.hitAt = shot.impact;
  }
  const radius = shot.splash ?? 0;
  if (!shot.toAir)
    for (const building of ctx.battle.buildings)
      if (building.hp > 0 && !isTrap(building.kind) && distanceTo(shot, building) <= radius)
        ctx.damageBuilding(building, shot.damage, shot.impact);
  damageDefenders(
    ctx.battle,
    shot,
    shot.damage,
    radius,
    shot.toAir ? 'air' : 'ground',
    undefined,
    shot.impact,
  );
  return true;
}
