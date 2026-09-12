import type { Battle, Building, Unit } from './model';

export interface BombTowerAttackState {
  shots: { at: number; x: number; y: number }[];
}

/** Bounded, derived visual history. Never consumes combat randomness. */
export function recordBombTowerShot(battle: Battle, tower: Building, target: Unit) {
  const state = ((battle.bombTowers ??= {})[tower.id] ??= { shots: [] });
  state.shots.push({ at: battle.elapsed, x: target.x, y: target.y });
  if (state.shots.length > 16) state.shots.shift();
}
