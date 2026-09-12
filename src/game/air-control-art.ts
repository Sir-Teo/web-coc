export const SWEEPER_ART_LEVELS = [1, 2, 3, 4] as const;
export const sweeperTexture = (level = 1, direction = 0) => `airsweeper-${level}-${direction}`;
export const sweeperAsset = (level = 1, direction = 0) =>
  `/assets/buildings/airsweeper-v1/level-${level}-${direction}.webp`;
