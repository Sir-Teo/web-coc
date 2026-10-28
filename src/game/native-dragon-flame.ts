import type { ChainTarget } from './chain-targets';
import { BUILDINGS, isTrap } from './data';
import { damageDefenders, hurtDefender } from './defenders';
import { distanceTo, type Unit } from './model';
import type { NativeTroopContext } from './native-troops';
import type { NativeUnitStats } from './native-units';

/** Dragon has no source projectile: its flame resolves once, on the target's layer. */
export function releaseDragonFlame(
  ctx: NativeTroopContext,
  unit: Unit,
  stats: NativeUnitStats,
  target: ChainTarget,
  damage: number,
) {
  const building = 'building' in target ? target.building : undefined,
    point =
      'defender' in target
        ? target.defender
        : {
            x: Math.max(
              target.building.x,
              Math.min(unit.x, target.building.x + BUILDINGS[target.building.kind].size),
            ),
            y: Math.max(
              target.building.y,
              Math.min(unit.y, target.building.y + BUILDINGS[target.building.kind].size),
            ),
          },
    air = 'defender' in target && target.defender.mode === 'air',
    at = ctx.battle.elapsed;
  if (building) ctx.damageBuilding(building, damage, at);
  else if ('defender' in target) hurtDefender(ctx.battle, target.defender, damage, at);
  damageDefenders(
    ctx.battle,
    point,
    damage,
    stats.splash,
    air ? 'air' : 'ground',
    'defender' in target ? target.defender.id : undefined,
    at,
  );
  if (!air)
    for (const other of ctx.buildings)
      if (
        other.id !== building?.id &&
        other.hp > 0 &&
        !isTrap(other.kind) &&
        distanceTo(point, other) <= stats.splash
      )
        ctx.damageBuilding(other, damage, at);
  ctx.effect({
    type: 'breath',
    sourceId: unit.id,
    targetId: 'building' in target ? target.building.id : target.defender.id,
    ...('building' in target ? { targetBuilding: true } : { targetDefender: true }),
    x: unit.x,
    y: unit.y,
    toX: point.x,
    toY: point.y,
    fromAir: true,
    toAir: air,
  });
  const state = (unit.native ??= {});
  state.lastAttackAt = at;
  state.attacks = (state.attacks ?? 0) + 1;
}
