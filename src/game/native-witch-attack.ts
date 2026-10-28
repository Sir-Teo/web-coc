import type { CombatProjectile } from './projectiles';
import { resolveRangedAreaImpact } from './native-ranged-area-impact';
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
  resolveRangedAreaImpact(ctx, shot);
  return true;
}
