import native from '../../reference/skeleton-trap/native.json';

/** Immutable public client 18.400.21 values; see docs/SKELETON-TRAP.md. */
export const SKELETON_TRAP = {
  trigger: 5,
  firstSpawn: 0.6,
  spawnInterval: 0.15,
  spawnIdle: 0.5,
  alertRadius: 7,
} as const;
export type SkeletonMode = 'ground' | 'air';
export const validSkeletonMode = (value: unknown): value is SkeletonMode | undefined =>
  value === undefined || value === 'ground' || value === 'air';
export const skeletonStats = (mode: SkeletonMode) => ({
  hp: 30,
  damage: 17.5,
  dps: 25,
  rate: 0.7,
  speed: mode === 'air' ? 2.2 : 3,
  range: mode === 'air' ? 0 : 0.4,
  flying: mode === 'air',
});
export const skeletonCount = (level: number) =>
  level >= 1 && level <= 4 && Number.isInteger(level) ? +native.rows[level - 1].NumSpawns : 0;
/** Finish the full native trigger clip; spawn timing uses the separate explicit delays. */
export const SKELETON_COFFIN_SECONDS = native.tiers[1].clips['ground-trigger'].count / 24;
