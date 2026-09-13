/** Registered Ghost Trap preview artwork. Until the original source capture lands,
 * the shared placeholder keeps preloading valid while the village remains gated. */
export const GHOST_TRAP_ART = {
  width: 168,
  height: 156,
  originX: 0.5,
  originY: 70 / 130,
};
export function ghostTrapTexture(level: number, variant?: string) {
  void level;
  void variant;
  return 'ghost-trap';
}
export function ghostTrapAsset(level: number, variant?: string) {
  void level;
  void variant;
  return '/assets/buildings/goblin-native/goblin_hut_lvl1.png';
}
