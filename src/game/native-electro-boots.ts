import type { Battle, Unit } from './model';

/** A stationary passive activation, independent of its owner's later movement or death. */
export interface ElectroBootsActivation {
  id: string;
  sourceId: number;
  at: number;
  x: number;
  y: number;
}

export function captureElectroBootsActivation(battle: Battle, unit: Unit, at: number) {
  if (!battle.nativeElectroBootsPresentation || unit.kind !== 'royalchampion') return;
  const id = `electro-boots:${unit.id}:${at}`;
  const history = (battle.nativeElectroBootsActivations ??= []);
  // Resurrection captures before movement; the subsequent aura refresh must keep that origin.
  const existing = history.find((event) => event.id === id);
  if (existing) return existing.id;
  history.push({ id, sourceId: unit.id, at, x: unit.x, y: unit.y });
  return id;
}
