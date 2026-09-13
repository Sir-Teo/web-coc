import type { Battle } from './model';
import { createInfernoScheduler, type InfernoScheduler } from './inferno-scheduler';
import { tickInfernoCombat, type InfernoHit } from './inferno-combat';

export interface InfernoBattleState {
  scheduler: InfernoScheduler;
  nextTick: number;
  /** Recent pulse records for presentation; old records are deterministically retired. */
  hits: InfernoHit[];
}

export function stepInfernos(battle: Battle, dt: number) {
  for (const tower of battle.buildings) {
    if (tower.kind !== 'inferno') continue;
    const states = (battle.infernos ??= {});
    const state = (states[tower.id] ??= {
      scheduler: createInfernoScheduler(tower.level, 'single'),
      nextTick: Math.floor((Math.max(0, battle.elapsed - dt) * 1000) / 64 + 1e-9) + 1,
      hits: [],
    });
    while (state.nextTick * 0.064 <= battle.elapsed + 1e-9) {
      const at = state.nextTick * 0.064;
      const enabled =
        tower.hp > 0 &&
        !tower.constructing &&
        !tower.upgradeEnd &&
        at > (battle.defenseStuns[tower.id] ?? 0);
      state.hits.push(...tickInfernoCombat(state.scheduler, tower, battle.units, at, enabled));
      state.nextTick++;
    }
    state.hits = state.hits.filter((hit) => hit.at >= battle.elapsed - 2);
  }
}
