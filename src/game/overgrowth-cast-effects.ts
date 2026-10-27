import source from '../../reference/overgrowth/effects.json' with { type: 'json' };
import type { Battle } from './model';
import { spellCastEffectEvents } from './native-spell-effects';
export const OVERGROWTH_CAST_EFFECTS = source.spellLevels
  .flatMap((row) => [row.PreDeployEffect, row.DeployEffect, row.DeployEffect2])
  .filter((name, i, names) => names.indexOf(name) === i);
/** Original landing art uses its source delay; the existing root pulse remains at 1.5 seconds. */
export function overgrowthCastEffects(
  battle: Battle | null,
  iso: (x: number, y: number) => { x: number; y: number },
  reduced: boolean,
  duration: (name: string) => number | undefined,
) {
  if (!battle?.nativeOvergrowthCastPresentation || reduced) return [];
  return spellCastEffectEvents(
    battle.nativeOvergrowthCasts ?? [],
    battle.elapsed,
    source.spellLevels,
    iso,
    duration,
    battle.nativeSpellEffectTimelines,
  );
}
