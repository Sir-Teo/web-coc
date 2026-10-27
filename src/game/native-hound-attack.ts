import { launchProjectile } from './projectiles';
import { hurtDefender, type Defender } from './defenders';
import { applyDefenderFrost } from './defender-frost';
import type { Unit } from './model';
import type { NativeUnitStats } from './native-units';
import type { NativeTroopContext } from './native-troops';

/** Source Lava spit or Ice Hound direct chill, when no building preference holds the attacker. */
export function releaseHoundAtDefender(
  ctx: NativeTroopContext,
  unit: Unit,
  stats: NativeUnitStats,
  target: Defender,
  damage: number,
) {
  if (stats.projectile)
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
        fromAir: true,
        toAir: target.mode === 'air',
        damage,
      },
      ctx.effect,
    );
  else {
    hurtDefender(ctx.battle, target, damage, ctx.battle.elapsed);
    if (ctx.battle.nativeDefenderFrost && stats.frostTime > 0)
      applyDefenderFrost(
        target,
        { seconds: stats.frostTime, percent: stats.frostPercent },
        ctx.battle.elapsed,
      );
    ctx.effect({
      type: 'hit',
      sourceId: unit.id,
      targetId: target.id,
      targetDefender: true,
      x: unit.x,
      y: unit.y,
      toX: target.x,
      toY: target.y,
      fromAir: true,
    });
  }
  const state = (unit.native ??= {});
  state.lastAttackAt = ctx.battle.elapsed;
  state.attacks = (state.attacks ?? 0) + 1;
}
