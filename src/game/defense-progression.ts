import { MORTAR_LEVELS, MORTAR } from './mortar-stats';
import type { BuildingKind } from './data';
import { XBOW_LEVELS, XBOW } from './xbow-stats';
import { TESLA_LEVELS, TESLA } from './tesla-stats';
import { BOMB_TOWER_LEVELS, BOMB_TOWER } from './bomb-tower-stats';
import { WIZARD_TOWER_LEVELS, WIZARD_TOWER } from './wizard-tower-stats';

/** Undiscounted destination-level values. See the defense progression audits in docs/. */
export const DEFENSE_PROGRESSION = {
  bombtower: BOMB_TOWER_LEVELS,
  tesla: TESLA_LEVELS,
  airdefense: [
    { dps: 80, hp: 800, cost: 22000, seconds: 3600 },
    { dps: 110, hp: 850, cost: 90000, seconds: 7200 },
    { dps: 140, hp: 900, cost: 210000, seconds: 21600 },
    { dps: 160, hp: 950, cost: 500000, seconds: 43200 },
    { dps: 190, hp: 1000, cost: 800000, seconds: 64800 },
    { dps: 230, hp: 1050, cost: 1000000, seconds: 86400 },
    // Accepted older saves retain levels beyond the TH8 ceiling.
    { dps: 280, hp: 1100, cost: 1750000, seconds: 172800 },
    { dps: 320, hp: 1210, cost: 2300000, seconds: 216000 },
    { dps: 360, hp: 1300, cost: 3400000, seconds: 259200 },
    { dps: 400, hp: 1400, cost: 5000000, seconds: 345600 },
  ],
  wizardtower: WIZARD_TOWER_LEVELS,
  cannon: [
    { dps: 7, hp: 300, cost: 250, seconds: 5 },
    { dps: 10, hp: 360, cost: 1000, seconds: 30 },
    { dps: 13, hp: 420, cost: 4000, seconds: 120 },
    { dps: 17, hp: 500, cost: 16000, seconds: 1200 },
    { dps: 23, hp: 600, cost: 50000, seconds: 1800 },
    { dps: 30, hp: 660, cost: 60000, seconds: 3600 },
    { dps: 40, hp: 730, cost: 100000, seconds: 7200 },
    { dps: 48, hp: 800, cost: 160000, seconds: 10800 },
    { dps: 56, hp: 880, cost: 250000, seconds: 12600 },
    { dps: 64, hp: 960, cost: 330000, seconds: 14400 },
    // Levels 11–12 remain valid in older saves, above the playable TH8 ceiling.
    { dps: 74, hp: 1060, cost: 500000, seconds: 16200 },
    { dps: 85, hp: 1160, cost: 600000, seconds: 18000 },
  ],
  mortar: MORTAR_LEVELS,
  archertower: [
    { dps: 11, hp: 380, cost: 1000, seconds: 15 },
    { dps: 15, hp: 420, cost: 2000, seconds: 120 },
    { dps: 19, hp: 460, cost: 5000, seconds: 1200 },
    { dps: 25, hp: 500, cost: 20000, seconds: 3600 },
    { dps: 30, hp: 540, cost: 70000, seconds: 5400 },
    { dps: 35, hp: 580, cost: 80000, seconds: 7200 },
    { dps: 42, hp: 630, cost: 150000, seconds: 10800 },
    { dps: 48, hp: 690, cost: 200000, seconds: 14400 },
    { dps: 56, hp: 750, cost: 400000, seconds: 18000 },
    { dps: 63, hp: 810, cost: 460000, seconds: 21600 },
    { dps: 70, hp: 890, cost: 600000, seconds: 25200 },
    { dps: 74, hp: 970, cost: 700000, seconds: 28800 },
  ],
} as const;

/** Normal mode; geared-up variants are not yet supported. */
export const DEFENSE_WEAPONS = {
  xbow: { range: XBOW.groundRange, rate: XBOW.interval },
  bombtower: { range: BOMB_TOWER.range, rate: BOMB_TOWER.interval, splash: BOMB_TOWER.splash },
  tesla: { range: TESLA.range, rate: TESLA.interval },
  airdefense: { range: 10, rate: 1 },
  wizardtower: {
    range: WIZARD_TOWER.range,
    rate: WIZARD_TOWER.interval,
    splash: WIZARD_TOWER.splash,
  },
  cannon: { range: 9, rate: 0.8 },
  mortar: {
    range: MORTAR.range,
    minRange: MORTAR.minRange,
    rate: MORTAR.interval,
    splash: MORTAR.splash,
  },
  archertower: { range: 10, rate: 0.5 },
} as const;

/** Returns a destination's stats when this defense has been audited. */
export function defenseProgression(kind: BuildingKind, level: number) {
  if (kind === 'xbow') return XBOW_LEVELS[level - 1];
  return kind === 'bombtower' ||
    kind === 'tesla' ||
    kind === 'cannon' ||
    kind === 'archertower' ||
    kind === 'mortar' ||
    kind === 'airdefense' ||
    kind === 'wizardtower'
    ? DEFENSE_PROGRESSION[kind][level - 1]
    : undefined;
}
