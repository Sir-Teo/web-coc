import type { Battle, Building, Unit } from './model';

/**
 * Per-frame id lookups for presentations. Every defense used to call `battle.units.find` (and
 * projectiles `battle.buildings.find`) each frame; this builds one map per simulation sample and
 * reuses it until `battle.elapsed` or the list itself changes. Read-only: nothing here mutates
 * the battle or feeds back into the simulation.
 */
interface BattleIndex {
  elapsed: number;
  unitList?: readonly Unit[];
  unitCount: number;
  units?: Map<number, Unit>;
  buildingList?: readonly Building[];
  buildingCount: number;
  buildings?: Map<number, Building>;
}
const indexes = new WeakMap<Battle, BattleIndex>();

function index(battle: Battle) {
  let entry = indexes.get(battle);
  if (!entry || entry.elapsed !== battle.elapsed) {
    entry = { elapsed: battle.elapsed, unitCount: -1, buildingCount: -1 };
    indexes.set(battle, entry);
  }
  return entry;
}
/** The battle unit with this id (any state), or undefined. */
export function battleUnit(battle: Battle, id: number | null | undefined): Unit | undefined {
  if (id === null || id === undefined) return undefined;
  const entry = index(battle);
  // Tests and tools push units between samples; a changed list rebuilds the map.
  if (!entry.units || entry.unitList !== battle.units || entry.unitCount !== battle.units.length) {
    entry.units = new Map();
    for (const unit of battle.units) if (!entry.units.has(unit.id)) entry.units.set(unit.id, unit);
    entry.unitList = battle.units;
    entry.unitCount = battle.units.length;
  }
  return entry.units.get(id);
}
/** The battle building with this id, or undefined. */
export function battleBuilding(
  battle: Battle,
  id: number | null | undefined,
): Building | undefined {
  if (id === null || id === undefined) return undefined;
  const entry = index(battle);
  if (
    !entry.buildings ||
    entry.buildingList !== battle.buildings ||
    entry.buildingCount !== battle.buildings.length
  ) {
    entry.buildings = new Map();
    for (const building of battle.buildings)
      if (!entry.buildings.has(building.id)) entry.buildings.set(building.id, building);
    entry.buildingList = battle.buildings;
    entry.buildingCount = battle.buildings.length;
  }
  return entry.buildings.get(id);
}
/** The unit a defense currently targets, as `battle.defenseTargets` records it. */
export const battleDefenseTarget = (battle: Battle, towerId: number) =>
  battleUnit(battle, battle.defenseTargets[towerId]);
