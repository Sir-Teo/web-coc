import { isSpellKind, type TroopKind } from '../game/data';
import { TROOP_SOURCE } from '../game/native-units';
import { HERO_SOURCE, type HeroKind } from '../game/native-hero-data';
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
  return iconPath(spell ? 'spell' : 'troop', name);
}

export const heroRosterIcon = (kind: HeroKind) => iconPath('hero', HERO_SOURCE[kind]);

function iconPath(category: 'hero' | 'spell' | 'troop', name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `/assets/catalog-native/roster/${category}-${slug}.png`;
}
