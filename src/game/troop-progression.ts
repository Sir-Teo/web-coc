import catalog from '../../reference/troops/catalog.json' with { type: 'json' };
import type { SpellKind, TroopKind } from './data';

/**
 * Every original level of the troops and spells this game trains. See
 * reference/troops/README.md; a row describes its destination level, and its price and
 * duration are what reaching that level costs.
 */
export interface TroopLevel {
  level: number;
  hp: number;
  dps: number;
  housing: number;
  laboratory: number;
  cost: number;
  seconds: number;
  resource: 'gold' | 'elixir' | 'dark';
  /** The Healer alone heals, which the source carries as a negative damage rate. */
  heal?: number;
  /** Wall Breakers and Balloons alone damage what they die on. */
  deathDamage?: number;
}
export const TROOP_LEVELS = catalog.troops as unknown as Readonly<
  Record<TroopKind, readonly TroopLevel[]>
>;
export const troopProgression = (kind: TroopKind, level: number) => TROOP_LEVELS[kind][level - 1];
/** Highest level the Laboratory can research, per troop. */
export const maxTroopLevelFor = (kind: TroopKind) => TROOP_LEVELS[kind].length;
export const MAX_TROOP_LEVEL = Math.max(...Object.values(TROOP_LEVELS).map((r) => r.length));

export interface SpellLevel {
  level: number;
  housing: number;
  laboratory: number;
  damage: number;
  heal: number;
  damageBoost: number;
  speedBoost: number;
  cost: number;
  seconds: number;
  resource: 'gold' | 'elixir' | 'dark';
}
export const SPELL_LEVELS = catalog.spells as unknown as Readonly<
  Record<SpellKind, readonly SpellLevel[]>
>;
export const spellProgression = (kind: SpellKind, level: number) => SPELL_LEVELS[kind][level - 1];
export const maxSpellLevelFor = (kind: SpellKind) => SPELL_LEVELS[kind].length;
export const MAX_SPELL_LEVEL = Math.max(...Object.values(SPELL_LEVELS).map((r) => r.length));
