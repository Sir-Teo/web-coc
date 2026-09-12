import type { Battle, Building, Unit } from './model';
import { TROOPS, type TroopKind } from './data';

export interface TeslaShot {
  index: number;
  at: number;
  targetId: number;
  targetKind: TroopKind;
  targetHero: boolean;
  x: number;
  y: number;
  toAir: boolean;
}
export interface TeslaAttackState {
  fired: number;
  destroyedAt?: number;
  shots: TeslaShot[];
}

/** Derived presentation history; damage, targeting and cadence remain in the simulation. */
export function recordTeslaShot(battle: Battle, tower: Building, target: Unit) {
  const state = ((battle.teslas ??= {})[tower.id] ??= { fired: 0, shots: [] });
  state.shots.push({
    index: ++state.fired,
    at: battle.elapsed,
    targetId: target.id,
    targetKind: target.kind,
    targetHero: !!target.hero,
    x: target.x,
    y: target.y,
    toAir: !!TROOPS[target.kind].flying,
  });
  // More than nine seconds of normal fire. Every imported effect and sound ends
  // well before this; an idle tower retains its last event without growing memory.
  if (state.shots.length > 16) state.shots.shift();
}

/** Independent visual randomness never consumes or changes the combat RNG. */
export function teslaVariation(id: number, shot: number, slot: number) {
  let n = (Math.imul(id, 0x9e3779b9) ^ Math.imul(shot, 0x85ebca6b) ^ slot) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x21f0aaad);
  n = Math.imul(n ^ (n >>> 15), 0x735a2d97);
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}
