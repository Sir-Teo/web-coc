import { BUILDINGS } from './data';
import { hurtDefender } from './defenders';
import { nativeUnitStats } from './native-units';
import { beginNativeAttackWindup, stepNativeAttackWindup } from './native-attack-windup';
import type { ChainTarget } from './chain-targets';
import type { Unit } from './model';
import type { NativeTroopContext } from './native-troops';

const stats = (ctx: NativeTroopContext, unit: Unit) =>
  nativeUnitStats('pekka', unit.level ?? ctx.battle.troopLevels?.pekka ?? 1);
/** A legacy-path PEKKA keeps its movement/selection; only its release gains a split clock. */
export function stepPekkaWindup(
  ctx: NativeTroopContext,
  unit: Unit,
  dt: number,
  actionDt: number,
  damage: number,
) {
  return stepNativeAttackWindup(ctx, unit, stats(ctx, unit), dt, actionDt, (target) => {
    let x: number, y: number;
    if ('building' in target) {
      ctx.damageBuilding(target.building, damage, ctx.battle.elapsed);
      const half = BUILDINGS[target.building.kind].size / 2;
      x = target.building.x + half;
      y = target.building.y + half;
    } else {
      hurtDefender(ctx.battle, target.defender, damage, ctx.battle.elapsed);
      x = target.defender.x;
      y = target.defender.y;
    }
    const state = (unit.native ??= {});
    state.lastAttackAt = ctx.battle.elapsed;
    state.attacks = (state.attacks ?? 0) + 1;
    ctx.effect({
      type: 'hit',
      sourceId: unit.id,
      targetId: 'building' in target ? target.building.id : target.defender.id,
      targetBuilding: 'building' in target,
      targetDefender: 'defender' in target,
      x: unit.x,
      y: unit.y,
      toX: x,
      toY: y,
    });
  });
}
export function beginPekkaWindup(ctx: NativeTroopContext, unit: Unit, target: ChainTarget) {
  beginNativeAttackWindup(unit, stats(ctx, unit), target, ctx.battle);
}
