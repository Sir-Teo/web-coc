import { decodeNativeArmyCode } from './native-army-code';
import { emptyArmy, emptySpells, type ArmyPreset, type PresetHero } from './army';
import { TROOP_KEYS, SPELL_KEYS } from './data';
import { isSiege } from './special-troops';
import { HERO_KINDS, validHero, validItem, itemHero, validPet } from './native-hero-data';

/** Local composition links carry counts and loadouts, never research or village progress. */
export const MAX_ARMY_CODE_LENGTH = 8192;
const VERSION = '1.';
type Entry = [string, number];
interface Composition {
  name: string;
  troops: Entry[];
  spells: Entry[];
  heroes?: PresetHero[];
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

function counts(value: unknown, keys: readonly string[]) {
  if (!Array.isArray(value) || value.length > keys.length) return null;
  const seen = new Set<string>(),
    result: Entry[] = [];
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length !== 2) return null;
    const [kind, count] = entry;
    if (
      typeof kind !== 'string' ||
      !keys.includes(kind) ||
      seen.has(kind) ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > 1000
    )
      return null;
    seen.add(kind);
    result.push([kind, count]);
  }
  return result;
}
function composition(value: unknown): Composition | null {
  if (
    !record(value) ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    value.name.length > 32
  )
    return null;
  const troops = counts(value.troops, TROOP_KEYS),
    spells = counts(value.spells, SPELL_KEYS);
  if (
    !troops?.length ||
    !spells ||
    troops.filter(([kind]) => isSiege(kind)).reduce((n, [, count]) => n + count, 0) > 3
  )
    return null;
  const result: Composition = { name: value.name.trim(), troops, spells };
  if (value.heroes !== undefined) {
    if (!Array.isArray(value.heroes) || value.heroes.length > HERO_KINDS.length) return null;
    const heroes: PresetHero[] = [],
      seen = new Set<string>(),
      pets = new Set<string>();
    for (const hero of value.heroes) {
      if (
        !record(hero) ||
        !validHero(hero.kind) ||
        seen.has(hero.kind) ||
        !Array.isArray(hero.items) ||
        hero.items.length > 2 ||
        new Set(hero.items).size !== hero.items.length ||
        !hero.items.every((slug) => validItem(slug) && itemHero(slug) === hero.kind) ||
        (hero.pet !== undefined && (!validPet(hero.pet) || pets.has(hero.pet)))
      )
        return null;
      seen.add(hero.kind);
      if (typeof hero.pet === 'string') pets.add(hero.pet);
      heroes.push({
        kind: hero.kind,
        items: [...hero.items],
        ...(hero.pet ? { pet: hero.pet } : {}),
      } as PresetHero);
    }
    result.heroes = heroes;
  }
  return result;
}

export function encodeArmy(preset: ArmyPreset): string | null {
  const data = composition({
    name: preset.name,
    troops: TROOP_KEYS.filter((kind) => preset.army[kind] > 0).map((kind) => [
      kind,
      preset.army[kind],
    ]),
    spells: SPELL_KEYS.filter((kind) => preset.spells[kind] > 0).map((kind) => [
      kind,
      preset.spells[kind],
    ]),
    ...(preset.heroes ? { heroes: preset.heroes } : {}),
  });
  if (!data) return null;
  let bytes = '';
  for (const byte of new TextEncoder().encode(JSON.stringify(data)))
    bytes += String.fromCharCode(byte);
  const code = VERSION + btoa(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return code.length <= MAX_ARMY_CODE_LENGTH ? code : null;
}

export function decodeArmy(code: string): ArmyPreset | null {
  code = code.trim();
  if (code.length > MAX_ARMY_CODE_LENGTH || !/^1\.[A-Za-z0-9_-]+$/.test(code)) return null;
  try {
    const bytes = Uint8Array.from(
      atob(code.slice(VERSION.length).replace(/-/g, '+').replace(/_/g, '/')),
      (char) => char.charCodeAt(0),
    );
    const data = composition(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
    if (!data) return null;
    const army = emptyArmy(),
      spells = emptySpells();
    for (const [kind, count] of data.troops) army[kind as keyof typeof army] = count;
    for (const [kind, count] of data.spells) spells[kind as keyof typeof spells] = count;
    return { name: data.name, army, spells, ...(data.heroes ? { heroes: data.heroes } : {}) };
  } catch {
    return null;
  }
}

/** Keep malformed escapes visible so the preview can explain that a link is damaged. */
export function armyFromLink(link: string) {
  const match = /[#?&]army=([^&#\s]+)/.exec(link);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}
export function armyLink(base: string, code: string) {
  const url = new URL(base);
  url.search = '';
  url.hash = `army=${encodeURIComponent(code)}`;
  return url.href;
}

/** Both local links and pinned original-game codes share one preview/apply boundary. */
export function decodeSharedArmy(code: string) {
  const local = decodeArmy(code);
  if (local) return { preset: local, notes: [] as string[] };
  const native = decodeNativeArmyCode(code);
  if (!native) return null;
  const notes: string[] = [];
  if (native.castle.troops.length || native.castle.spells.length)
    notes.push('Clan Castle troops and spells are not used here');
  if (native.modes.length) notes.push("Grand Warden's ground/air mode is not changed by this link");
  return { preset: native.preset, notes };
}
