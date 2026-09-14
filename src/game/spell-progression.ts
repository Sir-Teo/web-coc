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
export const LIGHTNING_STUN = 0.1;
/** Native movement-speed points convert to tiles/second at eight points per tile. */
export const SPELL_SPEED_SCALE = 8;
