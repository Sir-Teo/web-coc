import type { BuildingKind } from './data';

/** Undiscounted destination-level values. See the defense progression audits in docs/. */
export const DEFENSE_PROGRESSION = {
  airdefense: [
    { dps: 80, hp: 800, cost: 22000, seconds: 10800 },
    { dps: 110, hp: 850, cost: 90000, seconds: 21600 },
    { dps: 140, hp: 900, cost: 270000, seconds: 36000 },
    { dps: 160, hp: 950, cost: 500000, seconds: 57600 },
    { dps: 190, hp: 1000, cost: 800000, seconds: 86400 },
    { dps: 230, hp: 1050, cost: 1000000, seconds: 129600 },
    // Accepted older saves retain levels beyond the TH8 ceiling.
    { dps: 280, hp: 1100, cost: 1750000, seconds: 172800 },
    { dps: 320, hp: 1210, cost: 2300000, seconds: 216000 },
    { dps: 360, hp: 1300, cost: 3400000, seconds: 259200 },
    { dps: 400, hp: 1400, cost: 5800000, seconds: 345600 },
  ],
  wizardtower: [
    { dps: 11, hp: 620, cost: 120000, seconds: 7200 },
    { dps: 13, hp: 650, cost: 220000, seconds: 10800 },
    { dps: 16, hp: 680, cost: 400000, seconds: 21600 },
    { dps: 20, hp: 730, cost: 540000, seconds: 43200 },
    { dps: 24, hp: 840, cost: 700000, seconds: 64800 },
    { dps: 32, hp: 960, cost: 1000000, seconds: 86400 },
    { dps: 40, hp: 1200, cost: 1500000, seconds: 129600 },
    { dps: 45, hp: 1440, cost: 1600000, seconds: 151200 },
  ],
  cannon: [
    { dps: 9, hp: 420, cost: 250, seconds: 10 },
    { dps: 11, hp: 470, cost: 1000, seconds: 120 },
    { dps: 15, hp: 520, cost: 4000, seconds: 600 },
    { dps: 19, hp: 570, cost: 16000, seconds: 2700 },
    { dps: 25, hp: 620, cost: 50000, seconds: 3600 },
    { dps: 31, hp: 670, cost: 100000, seconds: 7200 },
    { dps: 40, hp: 730, cost: 150000, seconds: 14400 },
    { dps: 48, hp: 800, cost: 240000, seconds: 21600 },
    { dps: 56, hp: 880, cost: 360000, seconds: 28800 },
    { dps: 64, hp: 960, cost: 500000, seconds: 36000 },
    // Levels 11–12 remain valid in older saves, above the playable TH8 ceiling.
    { dps: 74, hp: 1060, cost: 800000, seconds: 43200 },
    { dps: 85, hp: 1160, cost: 900000, seconds: 50400 },
  ],
  mortar: [
    { dps: 4, hp: 400, cost: 5000, seconds: 7200 },
    { dps: 5, hp: 450, cost: 25000, seconds: 10800 },
    { dps: 6, hp: 500, cost: 100000, seconds: 14400 },
    { dps: 7, hp: 550, cost: 200000, seconds: 21600 },
    { dps: 9, hp: 600, cost: 300000, seconds: 43200 },
    { dps: 11, hp: 650, cost: 560000, seconds: 64800 },
    // Older saves accept levels 7–10, beyond the playable TH8 catalog.
    { dps: 15, hp: 700, cost: 1300000, seconds: 86400 },
    { dps: 20, hp: 800, cost: 1900000, seconds: 129600 },
    { dps: 25, hp: 950, cost: 2500000, seconds: 151200 },
    { dps: 30, hp: 1100, cost: 3500000, seconds: 172800 },
  ],
  archertower: [
    { dps: 11, hp: 380, cost: 1000, seconds: 60 },
    { dps: 15, hp: 420, cost: 2000, seconds: 900 },
    { dps: 19, hp: 460, cost: 5000, seconds: 2700 },
    { dps: 25, hp: 500, cost: 20000, seconds: 10800 },
    { dps: 30, hp: 540, cost: 80000, seconds: 14400 },
    { dps: 35, hp: 580, cost: 150000, seconds: 18000 },
    { dps: 42, hp: 630, cost: 300000, seconds: 21600 },
    { dps: 48, hp: 690, cost: 480000, seconds: 28800 },
    { dps: 56, hp: 750, cost: 580000, seconds: 36000 },
    { dps: 63, hp: 810, cost: 760000, seconds: 43200 },
    { dps: 70, hp: 890, cost: 1000000, seconds: 50400 },
    { dps: 74, hp: 970, cost: 1100000, seconds: 57600 },
  ],
} as const;

/** Normal mode; geared-up variants are not yet supported. */
export const DEFENSE_WEAPONS = {
  airdefense: { range: 10, rate: 1 },
  wizardtower: { range: 7, rate: 1.3, splash: 1 },
  cannon: { range: 9, rate: 0.8 },
  mortar: { range: 11, minRange: 4, rate: 5, splash: 1.5 },
  archertower: { range: 10, rate: 0.5 },
} as const;

/** Returns a destination's stats when this defense has been audited. */
export function defenseProgression(kind: BuildingKind, level: number) {
  return kind === 'cannon' ||
    kind === 'archertower' ||
    kind === 'mortar' ||
    kind === 'airdefense' ||
    kind === 'wizardtower'
    ? DEFENSE_PROGRESSION[kind][level - 1]
    : undefined;
}
