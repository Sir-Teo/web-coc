import type { SkeletonMode } from './skeleton-stats';
export const skeletonTrapAsset = (mode: SkeletonMode | 'spent' = 'ground') =>
  `/assets/buildings/skeleton-trap-v1/${mode}.webp`;
export const skeletonTrapTexture = (mode: SkeletonMode | 'spent' = 'ground') =>
  `skeletontrap-${mode}`;
export const skeletonAsset = (mode: SkeletonMode) => `/assets/characters/skeleton-v1/${mode}.webp`;
