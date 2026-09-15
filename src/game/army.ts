import { TROOPS, SPELLS, TROOP_KEYS, SPELL_KEYS, LATE_TROOP_KEYS } from './data';
import type { Army, SpellBook, Save } from './model';

export interface ArmyPreset {
  name: string;
  army: Army;
  spells: SpellBook;
}
export const armySpace = (army: Army) =>
  TROOP_KEYS.reduce((n, k) => n + (army[k] ?? 0) * TROOPS[k].space, 0);
export const spellSpace = (spells: SpellBook) =>
  SPELL_KEYS.reduce((n, k) => n + spells[k] * SPELLS[k].space, 0);
export const emptyArmy = () => Object.fromEntries(TROOP_KEYS.map((k) => [k, 0])) as Army;
export const emptySpells = (): SpellBook =>
  Object.fromEntries(SPELL_KEYS.map((k) => [k, 0])) as SpellBook;
/** Every spell at level one, for a village or recording that has no research yet. */
export const defaultSpellLevels = (): SpellBook =>
  Object.fromEntries(SPELL_KEYS.map((k) => [k, 1])) as SpellBook;
/** Spells added after the first three, which an older save has no field for. */
const LATE_SPELL_KEYS = ['freeze', 'invisibility', 'jump', 'clone', 'recall', 'revive'] as const;

/** Add absent roster fields without repairing malformed imported values. */
export function expandArmyRoster(save: Partial<Save>) {
  const expand = (value: unknown, initial: number) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const record = value as Record<string, unknown>;
    for (const kind of LATE_TROOP_KEYS) if (!Object.hasOwn(record, kind)) record[kind] = initial;
  };
  const expandSpells = (value: unknown, initial: number) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const record = value as Record<string, unknown>;
    for (const kind of LATE_SPELL_KEYS) if (!Object.hasOwn(record, kind)) record[kind] = initial;
  };
  expand(save.army, 0);
  expand(save.lastArmy, 0);
  expand(save.troopLevels, 1);
  expandSpells(save.spells, 0);
  expandSpells(save.lastSpells, 0);
  expandSpells(save.spellLevels, 1);
  if (Array.isArray(save.armyPresets))
    for (const preset of save.armyPresets) {
      expand(preset?.army, 0);
      expandSpells(preset?.spells, 0);
    }
  if (Array.isArray(save.raidLog))
    for (const raid of save.raidLog) {
      expand(raid?.deployed, 0);
      expandSpells(raid?.spells, 0);
    }
}
