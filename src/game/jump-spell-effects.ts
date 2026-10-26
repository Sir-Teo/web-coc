import source from '../../reference/jump-spell/effects.json' with { type: 'json' };
import type { Battle } from './model';
import { spellCastEffectEvents } from './native-spell-effects';
export const JUMP_SPELL_EFFECTS = Object.keys(source.effects);
export function jumpSpellEffectEvents(
  battle: Battle | null,
  iso: (x: number, y: number) => { x: number; y: number },
  reduced: boolean,
  duration: (name: string) => number | undefined,
) {
  if (!battle?.nativeSpellArt?.includes('Jump') || reduced) return [];
  return spellCastEffectEvents(
    battle.nativeSpellCastHistory?.filter((cast) => cast.name === 'Jump') ?? [],
    battle.elapsed,
    source.spellLevels,
    iso,
    duration,
  );
}
