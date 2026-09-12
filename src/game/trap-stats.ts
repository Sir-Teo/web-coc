import type { BuildingKind } from './data';
import { SEEKING_MINE_LEVELS } from './seeking-mine-stats';

/** Modern Home Village values; source reconciliation is documented in docs/TRAP-PROGRESSION.md. */
export const TRAP_LEVELS = {
  skeletontrap: [
    { damage: 0, cost: 6000, seconds: 0 },
    { damage: 0, cost: 250000, seconds: 18000 },
    { damage: 0, cost: 400000, seconds: 28800 },
    { damage: 0, cost: 1000000, seconds: 43200 },
  ],
  seekingairmine: SEEKING_MINE_LEVELS,
  bomb: [
    { damage: 20, cost: 400, seconds: 0 },
    { damage: 24, cost: 1000, seconds: 60 },
    { damage: 29, cost: 10000, seconds: 300 },
    { damage: 35, cost: 40000, seconds: 2400 },
    { damage: 42, cost: 100000, seconds: 3600 },
    { damage: 54, cost: 230000, seconds: 7200 },
    { damage: 72, cost: 330000, seconds: 10800 },
    { damage: 92, cost: 500000, seconds: 14400 },
  ],
  giantbomb: [
    { damage: 175, radius: 3, cost: 12500, seconds: 0 },
    { damage: 200, radius: 3.5, cost: 75000, seconds: 3600 },
    { damage: 225, radius: 3.5, cost: 220000, seconds: 10800 },
    { damage: 250, radius: 4, cost: 750000, seconds: 14400 },
    { damage: 275, radius: 4, cost: 900000, seconds: 36000 },
  ],
  airbomb: [
    { damage: 100, cost: 4000, seconds: 0 },
    { damage: 120, cost: 20000, seconds: 1800 },
    { damage: 144, cost: 75000, seconds: 3600 },
    { damage: 173, cost: 300000, seconds: 14400 },
    { damage: 208, cost: 550000, seconds: 28800 },
    { damage: 232, cost: 800000, seconds: 43200 },
  ],
  springtrap: [
    { damage: 0, capacity: 10, cost: 2000, seconds: 0 },
    { damage: 250, capacity: 12, cost: 130000, seconds: 3600 },
    { damage: 300, capacity: 14, cost: 240000, seconds: 7200 },
    { damage: 350, capacity: 16, cost: 350000, seconds: 10800 },
    { damage: 400, capacity: 18, cost: 800000, seconds: 14400 },
  ],
} as const;

export function trapProgression(kind: BuildingKind, level: number) {
  return kind === 'skeletontrap' ||
    kind === 'seekingairmine' ||
    kind === 'bomb' ||
    kind === 'giantbomb' ||
    kind === 'airbomb' ||
    kind === 'springtrap'
    ? TRAP_LEVELS[kind][level - 1]
    : undefined;
}

/** Local animation duration; the survivor remains on its original ground tile. */
export const SPRING_AIRTIME = 0.6;
