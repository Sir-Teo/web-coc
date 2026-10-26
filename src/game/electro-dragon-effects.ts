import source from '../../reference/electro-dragon/effects.json' with { type: 'json' };
import type { Battle } from './model';
import { chainEffectEvents } from './chain-effects';
type Point = { x: number; y: number };
export const ELECTRO_DRAGON_EFFECTS = [
  source.character.AttackEffect,
  source.character.ChainAttackEffect,
  source.character.HitEffect,
];
export function electroDragonEffectEvents(
  battle: Battle | null,
  iso: (x: number, y: number) => Point,
  airLift: number,
  attachment?: (id: number, name: string) => Point | undefined,
  duration?: (effect: string) => number | undefined,
) {
  if (!battle?.nativeElectroDragon || !battle.nativeElectroDragonZaps?.length) return [];
  return chainEffectEvents(
    battle,
    battle.nativeElectroDragonZaps,
    source.character,
    iso,
    airLift,
    attachment,
    duration,
  );
}
