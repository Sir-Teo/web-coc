import index from '../../reference/army-codes/index.json' with { type: 'json' };
import { emptyArmy, emptySpells, type ArmyPreset, type PresetHero } from './army';
import { TROOP_KEYS, SPELL_KEYS, type TroopKind, type SpellKind } from './data';
import { TROOP_SOURCE } from './native-units';
import { SPELL_NAMES } from './troop-progression';
import {
  HERO_SOURCE,
  PET_SOURCE,
  itemSlug,
  validItem,
  itemHero,
  type HeroKind,
  type PetKind,
} from './native-hero-data';
import { isSiege } from './special-troops';

const inverse = <K extends string>(source: Record<K, string>) =>
  new Map(Object.entries(source).map(([kind, name]) => [name as string, kind as K]));
const troops = inverse(TROOP_SOURCE as Record<TroopKind, string>),
  spells = inverse(SPELL_NAMES),
  heroes = inverse(HERO_SOURCE),
  pets = inverse(PET_SOURCE);

export interface NativeArmyCode {
  preset: ArmyPreset;
  castle: { troops: [TroopKind, number][]; spells: [SpellKind, number][] };
  modes: { hero: HeroKind; mode: number }[];
}

function units<K extends string>(
  value: string | undefined,
  names: Record<string, string>,
  kinds: Map<string, K>,
  allowed: readonly K[],
) {
  const result: [K, number][] = [],
    seen = new Set<K>();
  if (!value) return result;
  for (const entry of value.split('-')) {
    const match = /^(\d{1,4})x(\d{1,6})$/.exec(entry);
    if (!match) return null;
    const count = Number(match[1]),
      kind = kinds.get(names[String(Number(match[2]))]);
    if (!count || count > 1000 || !kind || !allowed.includes(kind) || seen.has(kind)) return null;
    seen.add(kind);
    result.push([kind, count]);
  }
  return result;
}

/** Pinned source codes use table GlobalIDs for units and record order for hero loadouts. */
export function decodeNativeArmyCode(code: string): NativeArmyCode | null {
  code = code.replace(/\s+/g, '');
  if (!code || code.length > 8192) return null;
  const sections = new Map<string, string>();
  let at = 0;
  for (const match of code.matchAll(/([hidus])([^hidus]*)/g)) {
    if (match.index !== at || !match[2] || sections.has(match[1])) return null;
    sections.set(match[1], match[2]);
    at += match[0].length;
  }
  if (at !== code.length) return null;
  const armyUnits = units(sections.get('u'), index.troops, troops, TROOP_KEYS),
    armySpells = units(sections.get('s'), index.spells, spells, SPELL_KEYS),
    castleTroops = units(sections.get('i'), index.troops, troops, TROOP_KEYS),
    castleSpells = units(sections.get('d'), index.spells, spells, SPELL_KEYS);
  if (
    !armyUnits?.length ||
    !armySpells ||
    !castleTroops ||
    !castleSpells ||
    armyUnits.filter(([kind]) => isSiege(kind)).reduce((n, [, count]) => n + count, 0) > 3
  )
    return null;
  const army = emptyArmy(),
    book = emptySpells(),
    lineup: PresetHero[] = [],
    modes: NativeArmyCode['modes'] = [],
    seen = new Set<HeroKind>(),
    usedPets = new Set<PetKind>();
  for (const entry of sections.get('h')?.split('-') ?? []) {
    const match = /^(\d{1,3})(?:m([01]))?(?:p(\d{1,3}))?(?:e(\d{1,3})(?:_(\d{1,3}))?)?$/.exec(
      entry,
    );
    if (!match) return null;
    const [, heroId, mode, petId, ...itemIds] = match,
      kind = heroes.get(index.heroes[Number(heroId)]);
    if (!kind || seen.has(kind) || (mode !== undefined && kind !== 'warden')) return null;
    seen.add(kind);
    const items: string[] = [];
    for (const id of itemIds) {
      if (id === undefined) continue;
      const name = index.items[Number(id)];
      if (!name) return null;
      const slug = itemSlug(name);
      if (!validItem(slug) || itemHero(slug) !== kind || items.includes(slug)) return null;
      items.push(slug);
    }
    const pet = petId === undefined ? undefined : pets.get(index.pets[Number(petId)]);
    if (petId !== undefined && (!pet || usedPets.has(pet))) return null;
    if (pet) usedPets.add(pet);
    lineup.push({ kind, items, ...(pet ? { pet } : {}) });
    if (mode !== undefined) modes.push({ hero: kind, mode: Number(mode) });
  }
  for (const [kind, count] of armyUnits) army[kind] = count;
  for (const [kind, count] of armySpells) book[kind] = count;
  return {
    preset: {
      name: 'Shared Clash army',
      army,
      spells: book,
      ...(lineup.length ? { heroes: lineup } : {}),
    },
    castle: { troops: castleTroops, spells: castleSpells },
    modes,
  };
}
