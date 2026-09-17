import catalog from '../../reference/heroes/catalog.json' with { type: 'json' };

/**
 * The six home-village heroes, straight from the pinned source. See
 * reference/heroes/README.md for the reading conventions this file relies on.
 */
export type HeroKey =
  'barbarianKing' | 'archerQueen' | 'grandWarden' | 'royalChampion' | 'minionPrince' | 'dragonDuke';

export interface HeroLevel {
  level: number;
  hp: number;
  dps: number;
  /** Hitpoints the ability restores on activation. */
  recovery: number;
  /** Which tier of the hero's own ability table this level activates. */
  tier: number;
  cost: number;
  seconds: number;
  /** Town Hall that permits this level. */
  townhall: number;
  /** Hero Hall that permits this level. */
  hall: number;
}

export interface HeroAbilityTier {
  tier: number;
  heal: number;
  seconds: number;
  activations: number;
}

export interface HeroSource {
  name: string;
  skin: string;
  housing: number;
  speed: number;
  range: number;
  attackSpeed: number;
  flying: boolean;
  airTargets: boolean;
  groundTargets: boolean;
  resource: string;
  slots: number;
  defaultItems: string[];
  ability: { name: string; tiers: HeroAbilityTier[] };
  passives: string[];
  equipment: { name: string; rarity: string; levels: number; unused: boolean }[];
  levels: HeroLevel[];
}

export const HERO_SOURCE = catalog.heroes as unknown as Record<HeroKey, HeroSource>;
export const HERO_KEYS = Object.keys(HERO_SOURCE) as HeroKey[];

/** Every hero level the source defines, in table order. */
export const heroLevels = (hero: HeroKey) => HERO_SOURCE[hero].levels;

/** Highest level the source defines for a hero, regardless of what a village permits. */
export const heroSourceCeiling = (hero: HeroKey) => HERO_SOURCE[hero].levels.length;

/**
 * Highest level a village may reach, which is the last row both its Town Hall and its Hero
 * Hall permit. A hero whose first row is already out of reach returns zero: not yet unlocked.
 */
export const heroCeiling = (hero: HeroKey, townhall: number, hall: number) =>
  HERO_SOURCE[hero].levels.filter((row) => row.townhall <= townhall && row.hall <= hall).length;

/** The Town Hall and Hero Hall that first unlock a hero at all. */
export const heroUnlock = (hero: HeroKey) => {
  const first = HERO_SOURCE[hero].levels[0];
  return { townhall: first.townhall, hall: first.hall };
};

/** What the next level needs, so a capped hero can name its own requirement. */
export const heroRequirement = (hero: HeroKey, level: number) => {
  const next = HERO_SOURCE[hero].levels[level];
  return next && { townhall: next.townhall, hall: next.hall };
};

/** The ability tier a hero level activates, with its recovery, duration and activation count. */
export const heroAbility = (hero: HeroKey, level: number) => {
  const source = HERO_SOURCE[hero];
  const row = source.levels[Math.max(0, Math.min(source.levels.length, level) - 1)];
  return source.ability.tiers[row.tier - 1];
};

/** Home-village heroes available through the native roster, in unlock order. */
export const OFFERED: readonly HeroKey[] = [
  'barbarianKing',
  'archerQueen',
  'minionPrince',
  'grandWarden',
  'royalChampion',
  'dragonDuke',
];
