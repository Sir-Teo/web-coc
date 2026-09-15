import source from '../../reference/full-client/progression.json';
import type { Building } from './model';
import type { TroopKind, SpellKind } from './data';
import { SPELL_SOURCE, spellFactory, spellFactoryLevel } from './spell-progression';

/** Supported Home Village unlocks. References: docs/ARMY-UNLOCKS.md. */
export const TROOP_UNLOCK: Record<TroopKind, number> = {
  ...(Object.fromEntries(
    Object.entries(source.troopDefs).map(([kind, row]) => [kind, Number(row.BarrackLevel)]),
  ) as Record<TroopKind, number>),
  swordsman: 1,
  archer: 2,
  giant: 3,
  goblin: 4,
  wallbreaker: 5,
  balloon: 6,
  wizard: 7,
  healer: 8,
  dragon: 9,
  pekka: 10,
};
/** Factory level from each spell's client row; spellFactory() names the factory. */
export const SPELL_UNLOCK = Object.fromEntries(
  (Object.keys(SPELL_SOURCE) as SpellKind[]).map((kind) => [kind, spellFactoryLevel(kind)]),
) as Record<SpellKind, number>;
export { spellFactory };

export function facilityLevel(
  buildings: Building[],
  kind: 'barracks' | 'darkbarracks' | 'spellfactory' | 'darkspellfactory',
) {
  return buildings.reduce(
    (level, b) => (b.kind === kind && !b.constructing ? Math.max(level, b.level) : level),
    0,
  );
}

export const troopFacility = (kind: TroopKind) =>
  source.troopDefs[kind].ProductionBuilding === 'Dark Barracks' ? 'darkbarracks' : 'barracks';
