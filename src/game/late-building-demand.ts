import { armedBuilderHut } from './builder-hut';
import type { Battle, Building } from './model';
import type { BuildingKind } from './data';

export const LATE_BUILDING_ART = {
  spellTower: 1 << 0,
  tornadoTrap: 1 << 1,
  freezeTrap: 1 << 2,
  ghostTrap: 1 << 3,
  eagleArtillery: 1 << 4,
  scattershot: 1 << 5,
  monolith: 1 << 6,
  goblinBuildings: 1 << 7,
  builderHut: 1 << 8,
} as const;
export const ALL_LATE_BUILDING_ART = Object.values(LATE_BUILDING_ART).reduce<number>(
  (mask, bit) => mask | bit,
  0,
);
const KINDS: Partial<Record<BuildingKind, number>> = {
  spelltower: LATE_BUILDING_ART.spellTower,
  tornadotrap: LATE_BUILDING_ART.tornadoTrap,
  eagleartillery: LATE_BUILDING_ART.eagleArtillery,
  scattershot: LATE_BUILDING_ART.scattershot,
  monolith: LATE_BUILDING_ART.monolith,
};
const NPCS: Partial<Record<NonNullable<Building['npc']>, number>> = {
  'freeze-trap': LATE_BUILDING_ART.freezeTrap,
  'ghost-trap': LATE_BUILDING_ART.ghostTrap,
  'comm-mast': LATE_BUILDING_ART.goblinBuildings,
  'goblin-hall': LATE_BUILDING_ART.goblinBuildings,
  'goblin-castle': LATE_BUILDING_ART.goblinBuildings,
  'foreboding-cave': LATE_BUILDING_ART.goblinBuildings,
  'goblin-boss-th': LATE_BUILDING_ART.goblinBuildings,
};
type Identity = Pick<Building, 'kind' | 'npc' | 'level'>;
/** Body families a building can draw, including campaign hut variants. */
export function lateBuildingArtMask(building: Identity, battle: Battle | null = null) {
  return (
    (KINDS[building.kind] ?? 0) |
    (building.npc ? (NPCS[building.npc] ?? 0) : 0) |
    (armedBuilderHut(battle, building as Building) ? LATE_BUILDING_ART.builderHut : 0)
  );
}
export function lateBuildingDemand(buildings: readonly Identity[], battle: Battle | null = null) {
  let mask = 0;
  for (const building of buildings) mask |= lateBuildingArtMask(building, battle);
  return mask;
}
