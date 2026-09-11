import type { BuildingKind } from './data';

/** Undiscounted destination-level values. Audit: docs/DEFENSE-PROGRESSION.md. */
export const DEFENSE_PROGRESSION = {
  cannon: [
    { hp: 420, cost: 250, seconds: 10 },
    { hp: 470, cost: 1000, seconds: 120 },
    { hp: 520, cost: 4000, seconds: 600 },
    { hp: 570, cost: 16000, seconds: 2700 },
    { hp: 620, cost: 50000, seconds: 3600 },
    { hp: 670, cost: 100000, seconds: 7200 },
    { hp: 730, cost: 150000, seconds: 14400 },
    { hp: 800, cost: 240000, seconds: 21600 },
    { hp: 880, cost: 360000, seconds: 28800 },
    { hp: 960, cost: 500000, seconds: 36000 },
    // Levels 11–12 remain valid in older saves, above the playable TH8 ceiling.
    { hp: 1060, cost: 800000, seconds: 43200 },
    { hp: 1160, cost: 900000, seconds: 50400 },
  ],
  archertower: [
    { hp: 380, cost: 1000, seconds: 60 },
    { hp: 420, cost: 2000, seconds: 900 },
    { hp: 460, cost: 5000, seconds: 2700 },
    { hp: 500, cost: 20000, seconds: 10800 },
    { hp: 540, cost: 80000, seconds: 14400 },
    { hp: 580, cost: 150000, seconds: 18000 },
    { hp: 630, cost: 300000, seconds: 21600 },
    { hp: 690, cost: 480000, seconds: 28800 },
    { hp: 750, cost: 580000, seconds: 36000 },
    { hp: 810, cost: 760000, seconds: 43200 },
    { hp: 890, cost: 1000000, seconds: 50400 },
    { hp: 970, cost: 1100000, seconds: 57600 },
  ],
} as const;

/** Returns a destination's stats when this defense has been audited. */
export function defenseProgression(kind: BuildingKind, level: number) {
  return kind === 'cannon' || kind === 'archertower'
    ? DEFENSE_PROGRESSION[kind][level - 1]
    : undefined;
}
