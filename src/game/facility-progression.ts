import type { BuildingKind } from './data';

/** Undiscounted Home Village army facilities. Sources: docs/FACILITY-PROGRESSION.md. */
export const FACILITY_LEVELS = {
  barracks: [
    { hp: 100, cost: 100, seconds: 10 },
    { hp: 200, cost: 500, seconds: 15 },
    { hp: 250, cost: 2500, seconds: 120 },
    { hp: 300, cost: 5000, seconds: 1800 },
    { hp: 360, cost: 20000, seconds: 7200 },
    { hp: 420, cost: 120000, seconds: 14400 },
    { hp: 500, cost: 270000, seconds: 21600 },
    { hp: 575, cost: 600000, seconds: 43200 },
    { hp: 650, cost: 1000000, seconds: 86400 },
    { hp: 730, cost: 1400000, seconds: 129600 },
  ],
  laboratory: [
    { hp: 500, cost: 5000, seconds: 60 },
    { hp: 550, cost: 25000, seconds: 1800 },
    { hp: 600, cost: 50000, seconds: 7200 },
    { hp: 650, cost: 100000, seconds: 14400 },
    { hp: 700, cost: 200000, seconds: 28800 },
    { hp: 750, cost: 400000, seconds: 57600 },
  ],
  spellfactory: [
    { hp: 425, cost: 150000, seconds: 21600, capacity: 2 },
    { hp: 470, cost: 300000, seconds: 43200, capacity: 4 },
    { hp: 520, cost: 600000, seconds: 86400, capacity: 6 },
    // Accepted legacy levels; new purchases stop at level 3 within TH1–8.
    { hp: 600, cost: 1200000, seconds: 172800, capacity: 8 },
    { hp: 720, cost: 2000000, seconds: 259200, capacity: 10 },
  ],
} as const;

export const FACILITY_COUNTS = {
  barracks: [1, 1, 1, 1, 1, 1, 1, 1],
  laboratory: [0, 0, 1, 1, 1, 1, 1, 1],
  spellfactory: [0, 0, 0, 0, 1, 1, 1, 1],
} as const;

export function facilityProgression(kind: BuildingKind, level: number) {
  return kind === 'barracks' || kind === 'laboratory' || kind === 'spellfactory'
    ? FACILITY_LEVELS[kind][level - 1]
    : undefined;
}

/** No completed factory means no housing; imported extra factories do not stack. */
export const spellFactoryCapacity = (level: number) =>
  FACILITY_LEVELS.spellfactory[level - 1]?.capacity ?? 0;
