export const TESLA_ART_LEVELS = [1, 2, 3, 4, 5, 6] as const;
export const teslaTexture = (level = 1) => (level === 1 ? 'tesla' : `tesla-${level}`);
export const teslaAsset = (level = 1) => `/assets/buildings/tesla-v1/level-${level}.webp`;
