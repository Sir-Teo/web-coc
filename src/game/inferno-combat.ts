import { unitHidden } from './native-status';
import { TROOPS } from './data';
import { distance2D } from './distance';
import type { Unit } from './model';
import { infernoStats } from './inferno-weapon';
import {
  infernoTargetKilled,
  tickInfernoScheduler,
  type InfernoScheduler,
  type InfernoPulse,
} from './inferno-scheduler';

export interface InfernoHit extends InfernoPulse {
  at: number;
  fromX: number;
  fromY: number;
  targetX: number;
  targetY: number;
  toAir: boolean;
  damage: number;
  killed: boolean;
}

/**
 * Resolve one scheduler tick against battle units. `at` is simulation seconds;
 * the battle driver must dispatch at 64-ms boundaries. Coordinates are tile units.
 * This adapter uses the game's floating HP arithmetic, not native HP quantization.
 */
export function tickInfernoCombat(
  state: InfernoScheduler,
  tower: { x: number; y: number },
  units: readonly Unit[],
  at: number,
  enabled = true,
): InfernoHit[] {
  if (!Number.isFinite(at) || at < 0) throw new Error('Invalid Inferno combat time');
  const stats = infernoStats(state.level);
  const fromX = tower.x + stats.size[0] / 2;
  const fromY = tower.y + stats.size[1] / 2;
  const range =
    (state.mode === 'multi' ? stats.weapon.alternateRangeSource : stats.weapon.rangeSource) / 100;
  const targets = units
    .filter(
      (unit) =>
        unit.hp > 0 &&
        !unit.ejected &&
        !unitHidden(unit, at) &&
        (unit.spawnedAt ?? 0) <= at &&
        (TROOPS[unit.kind].flying ? stats.weapon.airTargets : stats.weapon.groundTargets) &&
        distance2D(unit.x - fromX, unit.y - fromY) <= range,
    )
    .sort(
      (a, b) =>
        distance2D(a.x - fromX, a.y - fromY) - distance2D(b.x - fromX, b.y - fromY) || a.id - b.id,
    );
  const byId = new Map(targets.map((unit) => [unit.id, unit]));
  const hits: InfernoHit[] = [];
  for (const pulse of tickInfernoScheduler(
    state,
    targets.map((unit) => unit.id),
    enabled,
  )) {
    const target = byId.get(pulse.targetId)!;
    const damage = (pulse.dps * pulse.intervalMs) / 1000;
    const killed = target.hp <= damage;
    target.hp = Math.max(0, target.hp - damage);
    if (killed) {
      target.defeatedAt ??= at;
      infernoTargetKilled(state, pulse.slot);
    }
    hits.push({
      ...pulse,
      at,
      fromX,
      fromY,
      targetX: target.x,
      targetY: target.y,
      toAir: !!TROOPS[target.kind].flying,
      damage,
      killed,
    });
  }
  return hits;
}
