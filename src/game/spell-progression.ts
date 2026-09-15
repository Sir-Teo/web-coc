import {
  MAX_SPELL_LEVEL,
  maxSpellLevelFor,
  SPELL_LEVELS,
  spellProgression,
} from './troop-progression';

export type { SpellLevel } from './troop-progression';
export { MAX_SPELL_LEVEL, maxSpellLevelFor, SPELL_LEVELS, spellProgression };
/** Spell timing is this game's own sequencing, not a per-level source value. */
export const SPELL_PULSE_INTERVAL = 0.3;
export const HEAL_PULSES = 41;
export const RAGE_PULSES = 60;
export const RAGE_LINGER = 1;
export const HEAL_HERO_MULTIPLIER = 0.55;
export const RAGE_HERO_MULTIPLIER = 0.5;
/**
 * The Lightning Spell's stun, which the source carries as its own `FreezeTimeMS`. It is
 * asserted against that column in tests/spell-progression.test.ts.
 */
export const LIGHTNING_STUN = 0.1;
/** Seconds the Freeze Spell holds a defence or defender, straight from its own source row. */
export const freezeSeconds = (level = 1) =>
  spellProgression('freeze', level)?.mechanics?.freeze ??
  spellProgression('freeze', 1).mechanics!.freeze!;
/** The Freeze Spell's radius, which the source states per level and never varies. */
export const FREEZE_RADIUS = spellProgression('freeze', 1).mechanics!.radius!;
/** Native movement-speed points convert to tiles/second at eight points per tile. */
export const SPELL_SPEED_SCALE = 8;
