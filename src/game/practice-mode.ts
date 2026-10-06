import catalog from '../../reference/practice/catalog.json' with { type: 'json' };
import { emptyArmy, emptySpells } from './army';
import { SPELL_KEYS, TROOP_KEYS, type SpellKind, type TroopKind } from './data';
import { HERO_SOURCE, heroDefaultItems, type HeroKind } from './native-hero-data';
import type { HeroSetup } from './native-heroes';
import { TROOP_SOURCE } from './native-units';
import { SPELL_NAMES } from './troop-progression';
import type { Army, SpellBook } from './model';

/**
 * Practice Mode: the client's single-player Practice levels, each fought with the army it
 * provides instead of the player's own (logic/npcs.csv, imported by
 * scripts/import-native-practice.py). The villages are campaign stages 91 to 103. See
 * docs/PRACTICE-MODE.md.
 */
export interface PracticeLevel {
  id: string;
  name: string;
  /** The Town Hall that opens the level. */
  townHall: number;
  /** Its campaign stage, or null for the six Challenges this game withholds. */
  stage: number | null;
  gold: number;
  elixir: number;
  /** Troops and siege machines, the Clan Castle's units among them. */
  army: Army;
  spells: SpellBook;
  troopLevels: Army;
  spellLevels: SpellBook;
  heroes: HeroSetup[];
  /** The units the client sends in the Clan Castle (they join `army` here). */
  castle: [TroopKind, number][];
}
/** Practice Mode's strings: its title, description and the lock below Town Hall 4. */
export const PRACTICE_TEXTS = catalog.texts;

interface CatalogUnit {
  unit: string;
  kind: string;
  level: number;
  count: number;
  castle?: boolean;
}
const inverse = <K extends string>(source: Record<K, string>) =>
  new Map(Object.entries(source).map(([kind, name]) => [name as string, kind as K]));
const TROOPS = inverse<TroopKind>(TROOP_SOURCE as Record<TroopKind, string>);
const SPELLS = inverse<SpellKind>(SPELL_NAMES);
const HEROES = inverse<HeroKind>(HERO_SOURCE);

function level(row: (typeof catalog.levels)[number]): PracticeLevel {
  const army = emptyArmy(),
    spells = emptySpells();
  const troopLevels: Partial<Record<TroopKind, number>> = {},
    spellLevels: Partial<Record<SpellKind, number>> = {};
  const heroes: HeroSetup[] = [],
    castle: [TroopKind, number][] = [];
  // The army's own units set a kind's level before the Clan Castle's (Bowling with Bats sends
  // P.E.K.K.A 6 in the army and P.E.K.K.A 8 in the castle).
  const units = [...(row.army as CatalogUnit[])].sort((a, b) => +!!a.castle - +!!b.castle);
  for (const unit of units) {
    if (unit.kind === 'hero') {
      const kind = HEROES.get(unit.unit)!;
      const items = heroDefaultItems(kind).map((slug) => ({ slug, level: 1 }));
      heroes.push({ kind, level: unit.level, items });
    } else if (unit.kind === 'spell') {
      const kind = SPELLS.get(unit.unit)!;
      spells[kind] += unit.count;
      spellLevels[kind] ??= unit.level;
    } else {
      const kind = TROOPS.get(unit.unit)!;
      army[kind] += unit.count;
      troopLevels[kind] ??= unit.level;
      if (unit.castle) castle.push([kind, unit.count]);
    }
  }
  return {
    id: row.id,
    name: row.name,
    townHall: row.townHall,
    stage: row.stage,
    gold: row.gold,
    elixir: row.elixir,
    army,
    spells,
    troopLevels: Object.fromEntries(TROOP_KEYS.map((k) => [k, troopLevels[k] ?? 1])) as Army,
    spellLevels: Object.fromEntries(SPELL_KEYS.map((k) => [k, spellLevels[k] ?? 1])) as SpellBook,
    heroes,
    castle,
  };
}
/** All 19 Practice levels, by Town Hall, the six withheld ones included (stage null). */
export const PRACTICE_LEVELS: readonly PracticeLevel[] = catalog.levels.map(level);
/** The Practice level a campaign village is, by its index on the Goblin map, if any. */
export const practiceLevelAt = (index: number) =>
  PRACTICE_LEVELS.find((level) => level.stage === index + 1);
/** The Town Hall that opens Practice Mode (Town Hall 4). */
export const PRACTICE_TOWN_HALL = Math.min(...PRACTICE_LEVELS.map((level) => level.townHall));
