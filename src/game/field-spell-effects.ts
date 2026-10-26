import source from '../../reference/field-spells/effects.json' with { type: 'json' };
export const FIELD_SPELL_PROFILES = source.spells;

/** Source-backed visual tails may survive long after the physical cast ends. */
export function fieldSpellHistoryUntil(cast: { name: string; level: number; castAt: number }) {
  const levels: readonly { level: number; retainSeconds?: number }[] | undefined =
    FIELD_SPELL_PROFILES[cast.name as keyof typeof FIELD_SPELL_PROFILES]?.levels;
  return cast.castAt + (levels?.find((row) => row.level === cast.level)?.retainSeconds ?? 0);
}
