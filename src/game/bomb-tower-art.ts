export const BOMB_TOWER_ART_LEVELS = [1, 2] as const;
export const bombTowerTexture = (level = 1) => `bombtower-base-${level}`;
export const bombTowerAsset = (level = 1, part = 'preview') =>
  `/assets/buildings/bombtower-v1/level-${level}-${part}.webp`;
export const BOMBER_ASSET = '/assets/buildings/bombtower-v1/bomber.webp';
export const DEATH_BOMB_ASSET = '/assets/buildings/bombtower-v1/death-bomb.webp';
/** Normalized roof center; the actor's feet and throw origin are tied to the platform. */
export const BOMB_TOWER_ROOF = { x: 0.5, y: 218.5 / 512 };
export const BOMBER_WIDTH = (130 * 144) / 384;
