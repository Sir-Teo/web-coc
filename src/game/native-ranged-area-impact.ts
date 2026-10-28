import type { CombatProjectile } from './projectiles';
import { isTrap } from './data';
import { damageDefenders } from './defenders';
import { distanceTo } from './model';
import type { NativeTroopContext } from './native-troops';

/** One fixed-point area pass, on the captured layer and at the physical impact time. */
export function resolveRangedAreaImpact(ctx: NativeTroopContext, shot: CombatProjectile) {
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
}
