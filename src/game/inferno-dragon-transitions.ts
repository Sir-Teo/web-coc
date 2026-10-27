import type { Battle, Unit } from './model';
import type { NativeDamageRampStats } from './native-damage-ramp';

/** Dated presentation evidence; no transition feeds back into damage or target selection. */
export interface InfernoDragonTransition {
  unitId: number;
  at: number;
  stage: 1 | 2;
  x: number;
  y: number;
}

/** Observe an eligible, in-range attack before its damage pulse can kill and clear the lock. */
export function recordInfernoDragonTransition(
  battle: Battle,
  unit: Unit,
  stats: NativeDamageRampStats,
  targetId: number,
  defender: boolean,
) {
  if (!battle.nativeTroopDamageRamp || unit.kind !== 'infernodragon') return;
  const ramp = unit.native?.damageRamp;
  if (!ramp || ramp.targetId !== targetId || ramp.defender !== defender) return;
  const age = battle.elapsed - ramp.startedAt;
  const stage = age + 1e-9 >= stats.switchAt[1] ? 2 : age + 1e-9 >= stats.switchAt[0] ? 1 : 0;
  if (stage <= (ramp.presentedStage ?? 0)) return;
  ramp.presentedStage = stage;
  (battle.infernoDragonTransitions ??= []).push({
    unitId: unit.id,
    at: battle.elapsed,
    stage: stage as 1 | 2,
    x: unit.x,
    y: unit.y,
  });
}

export const infernoDragonTransitionKey = (event: InfernoDragonTransition) =>
  `inferno-dragon:${event.unitId}:transition:${event.at}:${event.stage}`;

/** The longest source sound lasts under two seconds even at its lower authored pitch. */
export function retireInfernoDragonTransitions(battle: Battle) {
  if (battle.infernoDragonTransitions)
    battle.infernoDragonTransitions = battle.infernoDragonTransitions.filter(
      (event) => event.at >= battle.elapsed - 2,
    );
}
