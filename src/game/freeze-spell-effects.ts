import source from '../../reference/freeze-spell/effects.json' with { type: 'json' };
import type { Battle } from './model';
import { spellCastEffectEvents } from './native-spell-effects';
export const FREEZE_SPELL_EFFECTS = Object.keys(source.effects);
export function freezeSpellEffectEvents(
  battle: Battle | null,
  iso: (x: number, y: number) => { x: number; y: number },
  reduced: boolean,
  duration: (name: string) => number | undefined,
) {
  if (!battle?.nativeFreezeCastPresentation || reduced) return [];
  return spellCastEffectEvents(
    battle.nativeFreezeCasts ?? [],
    battle.elapsed,
    source.spellLevels,
    iso,
    duration,
  );
}
