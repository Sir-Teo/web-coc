/** Registered armed Builder's Hut preview artwork. Until the original source capture lands,
 * the shared placeholder keeps preloading valid while the village remains gated. */
export const BUILDER_HUT_ART = {
  width: 168,
  height: 156,
  originX: 0.5,
  originY: 70 / 130,
};
export function builderHutTexture(level: number, variant?: string) {
  void level;
  void variant;
  return 'builder';
}
export function builderHutAsset(level: number, variant?: string) {
  void level;
  void variant;
  return '/assets/buildings/goblin-native/goblin_hut_lvl1.png';
}
