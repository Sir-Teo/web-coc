import { isSpellKind, type TroopKind } from '../game/data';
import { TROOP_SOURCE } from '../game/native-units';
import { SPELL_NAMES } from '../game/troop-progression';

/** Roster cards use the source table's standalone UI icon, separate from world art. */
export function rosterIcon(kind: string) {
  const spell = isSpellKind(kind);
  const name = spell
    ? SPELL_NAMES[kind]
    : Object.hasOwn(TROOP_SOURCE, kind)
      ? TROOP_SOURCE[kind as TroopKind]
      : undefined;
  if (!name) return undefined;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `/assets/catalog-native/roster/${spell ? 'spell' : 'troop'}-${slug}.png`;
}
