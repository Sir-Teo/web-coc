import type { BuildingKind } from './data';

/** Undiscounted Home Village values; sources: docs/CAMP-PROGRESSION.md. */
export const CAMP_LEVELS = [
  { capacity: 20, hp: 100, cost: 200, seconds: 60 },
  { capacity: 30, hp: 150, cost: 2000, seconds: 300 },
  { capacity: 35, hp: 200, cost: 10000, seconds: 1800 },
  { capacity: 40, hp: 250, cost: 100000, seconds: 7200 },
  { capacity: 45, hp: 300, cost: 250000, seconds: 21600 },
  { capacity: 50, hp: 330, cost: 500000, seconds: 43200 },
  // Retained for accepted older saves; playable TH8 progression stops at level 6.
  { capacity: 55, hp: 400, cost: 1500000, seconds: 172800 },
  { capacity: 60, hp: 500, cost: 2500000, seconds: 259200 },
] as const;
export const CAMP_COUNTS = [1, 1, 2, 2, 3, 3, 4, 4] as const;
export const campCapacity = (level: number) =>
  CAMP_LEVELS[Math.min(CAMP_LEVELS.length, Math.max(1, level)) - 1].capacity;
export const campProgression = (kind: BuildingKind, level: number) =>
  kind === 'camp' ? CAMP_LEVELS[Math.min(CAMP_LEVELS.length, Math.max(1, level)) - 1] : undefined;
