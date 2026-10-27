import { isTrap } from './data';
import { damageDefenders } from './defenders';
import { distanceTo } from './model';
import { targetableBuilding } from './hidden-tesla';
import type { Unit } from './model';
import type { NativeUnitStats } from './native-units';
import type { NativeTroopContext } from './native-troops';

/** Source SelfAsAoeCenter/AttackMultipleBuildings applies equally to both target routes. */
export function sweepValkyrie(
  ctx: NativeTroopContext,
  unit: Unit,
  stats: NativeUnitStats,
  damage: number,
) {
  const battle = ctx.battle,
    radius = Math.max(stats.splash, stats.range);
  for (const building of battle.buildings)
    if (
      building.hp > 0 &&
      !isTrap(building.kind) &&
      targetableBuilding(battle, building) &&
      distanceTo(unit, building) <= radius + 1e-9
    )
      ctx.damageBuilding(building, damage, battle.elapsed);
  damageDefenders(battle, unit, damage, radius, 'ground', undefined, battle.elapsed);
  ctx.effect({
    type: 'blast',
    x: unit.x,
    y: unit.y,
    radius,
    sourceId: unit.id,
    nativeValkyrieSweep: true,
  });
  const state = (unit.native ??= {});
  state.lastAttackAt = battle.elapsed;
  state.attacks = (state.attacks ?? 0) + 1;
}
