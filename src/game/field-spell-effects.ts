import source from '../../reference/field-spells/effects.json' with { type: 'json' };
export const FIELD_SPELL_PROFILES = source.spells;

type SpellIdentity = { name: string; level: number };
function fieldSpellLevel(cast: SpellIdentity) {
  const levels:
    readonly { level: number; retainSeconds?: number; deploy2DelaySeconds?: number }[] | undefined =
    FIELD_SPELL_PROFILES[cast.name as keyof typeof FIELD_SPELL_PROFILES]?.levels;
  return levels?.find((row) => row.level === cast.level);
}
/** Source-backed visual tails may survive long after the physical cast ends. */
export function fieldSpellHistoryUntil(cast: SpellIdentity & { castAt: number }) {
  return cast.castAt + (fieldSpellLevel(cast)?.retainSeconds ?? 0);
}
/** Used only by captured source presentation; earlier replay audio retains its former timing. */
export function fieldSpellDeploy2Delay(cast: SpellIdentity) {
  return fieldSpellLevel(cast)?.deploy2DelaySeconds ?? 0;
}

/** A source chain with no effects shares its parent's readiness and fallback handoff. */
export function fieldSpellPresentationName(name: string | undefined) {
  const children: Readonly<Record<string, string>> = source.silentChildren;
  return name === undefined ? undefined : (children[name] ?? name);
}
