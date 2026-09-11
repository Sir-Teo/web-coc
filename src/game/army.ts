import { TROOPS, SPELLS, TROOP_KEYS, SPELL_KEYS } from './data';
import type { Army, SpellBook } from './model';

export interface ArmyPreset {
  name: string;
  army: Army;
  spells: SpellBook;
}
export const armySpace = (army: Army) =>
  TROOP_KEYS.reduce((n, k) => n + army[k] * TROOPS[k].space, 0);
export const spellSpace = (spells: SpellBook) =>
  SPELL_KEYS.reduce((n, k) => n + spells[k] * SPELLS[k].space, 0);
export const emptyArmy = () => Object.fromEntries(TROOP_KEYS.map((k) => [k, 0])) as Army;
export const emptySpells = (): SpellBook => ({ rage: 0, heal: 0, lightning: 0 });
