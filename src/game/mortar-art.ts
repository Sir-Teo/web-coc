/** Original level artwork; geometry is measured in the aligned 384px source frames. */
export const MORTAR_ART_LEVELS = [1, 2, 3, 4, 5, 6] as const;
const safeLevel = (level: number) => Math.min(6, Math.max(1, Math.floor(level) || 1));
export const mortarTexture = (level: number) =>
  safeLevel(level) === 1 ? 'mortar' : `mortar-level-${safeLevel(level)}`;
export const mortarAsset = (level: number) =>
  `/assets/buildings/mortar-levels-v1/level-${safeLevel(level)}.webp`;

// Centers of the dark bore in each aligned frame, measured after normalization.
const MUZZLES = [
  [220, 81],
  [214, 82],
  [216, 82],
  [214, 76],
  [221, 75],
  [216, 80],
] as const;
export const mortarMuzzle = (level: number) => {
  const [x, y] = MUZZLES[safeLevel(level) - 1];
  return { x: x / 384, y: y / 384 };
};
