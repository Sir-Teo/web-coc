export type LateGoblinBuildingKind =
  'comm-mast' | 'goblin-hall' | 'goblin-castle' | 'foreboding-cave' | 'goblin-boss-th';
/** Registered previews for the late Goblin campaign buildings. Until the original source
 * capture lands, the shared placeholder keeps preloading valid while villages remain gated. */
export const LATE_GOBLIN_BUILDING_ART: Record<
  LateGoblinBuildingKind,
  { texture: string; asset: string; width: number; originX: number; originY: number }
> = {
  'comm-mast': {
    texture: 'comm-mast',
    asset: '/assets/buildings/goblin-native/goblin_hut_lvl1.png',
    width: 168,
    originX: 0.5,
    originY: 70 / 130,
  },
  'goblin-hall': {
    texture: 'goblin-hall',
    asset: '/assets/buildings/goblin-native/goblin_hut_lvl1.png',
    width: 240,
    originX: 0.5,
    originY: 110 / 180,
  },
  'goblin-castle': {
    texture: 'goblin-castle',
    asset: '/assets/buildings/goblin-native/goblin_hut_lvl1.png',
    width: 200,
    originX: 0.5,
    originY: 110 / 180,
  },
  'foreboding-cave': {
    texture: 'foreboding-cave',
    asset: '/assets/buildings/goblin-native/goblin_hut_lvl1.png',
    width: 240,
    originX: 0.5,
    originY: 110 / 180,
  },
  'goblin-boss-th': {
    texture: 'goblin-boss-th',
    asset: '/assets/buildings/goblin-native/goblin_hut_lvl1.png',
    width: 240,
    originX: 0.5,
    originY: 110 / 180,
  },
};
export const isLateGoblinBuilding = (value: unknown): value is LateGoblinBuildingKind =>
  typeof value === 'string' && Object.hasOwn(LATE_GOBLIN_BUILDING_ART, value);
