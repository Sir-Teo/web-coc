import type { Battle, Building } from './model';
import type { BuildingKind } from './data';

/**
 * Building sub-lists that depend only on the layout (kinds never change during a battle), cached
 * by the battle's list identity and length so every caller in a tick shares one array. Sharing
 * matters beyond the allocation: the collision grids recognize a list they have already
 * verified by identity, so a fresh `filter` per search forced a full rescan of the snapshot.
 */
interface Entry {
  buildings: Building[];
  length: number;
  nonWall: Building[];
  byKind: Map<BuildingKind, Building[]>;
}
const entries = new WeakMap<Battle, Entry>();

function entryFor(battle: Battle): Entry {
  const known = entries.get(battle);
  if (known && known.buildings === battle.buildings && known.length === battle.buildings.length)
    return known;
  const entry = {
    buildings: battle.buildings,
    length: battle.buildings.length,
    nonWall: battle.buildings.filter((b) => b.kind !== 'wall'),
    byKind: new Map<BuildingKind, Building[]>(),
  };
  entries.set(battle, entry);
  return entry;
}

/** Every building except walls, in layout order (standing or not). */
export function nonWallBuildings(battle: Battle): Building[] {
  return entryFor(battle).nonWall;
}

/** Layout-order family list, including fallen towers whose state still needs to be retired. */
export function buildingsOfKind(battle: Battle, kind: BuildingKind): readonly Building[] {
  const entry = entryFor(battle);
  let buildings = entry.byKind.get(kind);
  if (!buildings) {
    buildings = battle.buildings.filter((b) => b.kind === kind);
    entry.byKind.set(kind, buildings);
  }
  return buildings;
}
