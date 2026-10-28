import type { CombatProjectile } from './projectiles';
import { isTrap } from './data';
import { damageDefenders } from './defenders';
import { distanceTo } from './model';
import type { NativeTroopContext } from './native-troops';

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
