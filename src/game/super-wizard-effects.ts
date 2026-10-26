import source from '../../reference/super-wizard/effects.json' with { type: 'json' };
import type { Battle } from './model';
import { chainEffectEvents } from './chain-effects';
type Point = { x: number; y: number };
export const SUPER_WIZARD_EFFECTS = [
  source.character.AttackEffect,
  source.character.ChainAttackEffect,
  source.character.HitEffect,
];
export function superWizardEffectEvents(
  battle: Battle | null,
  iso: (x: number, y: number) => Point,
  airLift: number,
  attachment?: (id: number, name: string) => Point | undefined,
  duration?: (effect: string) => number | undefined,
) {
  if (!battle?.nativeSuperWizard || !battle.nativeSuperWizardZaps?.length) return [];
  return chainEffectEvents(
    battle,
    battle.nativeSuperWizardZaps,
    source.character,
    iso,
    airLift,
    attachment,
    duration,
  );
}
