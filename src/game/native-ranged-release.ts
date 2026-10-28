import { launchProjectile } from './projectiles';
import type { Defender } from './defenders';
import type { Unit } from './model';
import type { NativeUnitStats } from './native-units';
import type { NativeTroopContext } from './native-troops';

/** Source projectile, splash and source/target layers captured at physical release. */
export function releaseRangedAtDefender(
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
      fromAir: stats.flying,
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
