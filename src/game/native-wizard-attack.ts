import { BUILDINGS } from './data';
import { launchProjectile } from './projectiles';
import { releaseRangedAtDefender } from './native-ranged-release';
import type { ChainTarget } from './chain-targets';
import type { Unit } from './model';
import type { NativeUnitStats } from './native-units';
import type { NativeTroopContext } from './native-troops';

/** Ordinary and Siege Barracks Wizards keep their own source tier and original fireball. */
export function releaseWizardShot(
  ctx: NativeTroopContext,
  unit: Unit,
  stats: NativeUnitStats,
  target: ChainTarget,
  damage: number,
) {
  if ('defender' in target) {
    releaseRangedAtDefender(ctx, unit, stats, target.defender, damage);
    return;
  }
  const building = target.building,
    half = BUILDINGS[building.kind].size / 2;
  launchProjectile(
    ctx.battle,
    {
      weapon: 'native',
      native: { kind: 'wizard', level: stats.level, name: stats.projectile },
      sourceId: unit.id,
      targetId: building.id,
      targetBuilding: true,
      fromX: unit.x,
      fromY: unit.y,
      x: building.x + half,
      y: building.y + half,
      fromAir: false,
      damage,
      splash: stats.splash,
    },
    ctx.effect,
  );
  const state = (unit.native ??= {});
  state.lastAttackAt = ctx.battle.elapsed;
  state.attacks = (state.attacks ?? 0) + 1;
}
