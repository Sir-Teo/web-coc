import type { TroopKind } from './data';

/** Undiscounted Home Village values; each row describes its destination level.
 * Sources and conversion notes: docs/TROOP-PROGRESSION.md.
 */
interface TroopLevel {
  hp: number;
  dps: number;
  cost: number;
  seconds: number;
  laboratory: number;
  deathDamage?: number;
}
export const TROOP_LEVELS: Readonly<Record<TroopKind, readonly TroopLevel[]>> = {
  swordsman: [
    { hp: 45, dps: 9, cost: 0, seconds: 0, laboratory: 0 },
    { hp: 54, dps: 12, cost: 10000, seconds: 1800, laboratory: 1 },
    { hp: 65, dps: 15, cost: 50000, seconds: 3600, laboratory: 3 },
    { hp: 85, dps: 18, cost: 130000, seconds: 7200, laboratory: 5 },
    { hp: 105, dps: 23, cost: 300000, seconds: 14400, laboratory: 6 },
  ],
  archer: [
    { hp: 22, dps: 8, cost: 0, seconds: 0, laboratory: 0 },
    { hp: 26, dps: 10, cost: 20000, seconds: 3600, laboratory: 1 },
    { hp: 29, dps: 13, cost: 80000, seconds: 7200, laboratory: 3 },
    { hp: 33, dps: 16, cost: 200000, seconds: 10800, laboratory: 5 },
    { hp: 40, dps: 20, cost: 500000, seconds: 28800, laboratory: 6 },
  ],
  giant: [
    { hp: 400, dps: 12, cost: 0, seconds: 0, laboratory: 0 },
    { hp: 500, dps: 15, cost: 40000, seconds: 7200, laboratory: 2 },
    { hp: 600, dps: 20, cost: 150000, seconds: 14400, laboratory: 4 },
    { hp: 700, dps: 24, cost: 400000, seconds: 21600, laboratory: 5 },
    { hp: 900, dps: 31, cost: 800000, seconds: 43200, laboratory: 6 },
  ],
  wizard: [
    { hp: 75, dps: 50, cost: 0, seconds: 0, laboratory: 0 },
    { hp: 90, dps: 70, cost: 120000, seconds: 14400, laboratory: 3 },
    { hp: 108, dps: 90, cost: 300000, seconds: 18000, laboratory: 4 },
    { hp: 135, dps: 125, cost: 600000, seconds: 43200, laboratory: 5 },
    { hp: 165, dps: 170, cost: 1200000, seconds: 64800, laboratory: 6 },
  ],
  balloon: [
    { hp: 150, dps: 25, deathDamage: 25, cost: 0, seconds: 0, laboratory: 0 },
    { hp: 180, dps: 32, deathDamage: 32, cost: 100000, seconds: 14400, laboratory: 2 },
    { hp: 216, dps: 48, deathDamage: 48, cost: 400000, seconds: 21600, laboratory: 4 },
    { hp: 280, dps: 72, deathDamage: 72, cost: 720000, seconds: 64800, laboratory: 5 },
    { hp: 390, dps: 108, deathDamage: 108, cost: 1300000, seconds: 86400, laboratory: 6 },
  ],
  goblin: [
    { hp: 25, dps: 11, cost: 0, seconds: 0, laboratory: 0 },
    { hp: 30, dps: 14, cost: 45000, seconds: 7200, laboratory: 1 },
    { hp: 36, dps: 19, cost: 100000, seconds: 10800, laboratory: 3 },
    { hp: 50, dps: 24, cost: 500000, seconds: 21600, laboratory: 5 },
    { hp: 65, dps: 32, cost: 700000, seconds: 43200, laboratory: 6 },
  ],
  wallbreaker: [
    { hp: 20, dps: 10, deathDamage: 6, cost: 0, seconds: 0, laboratory: 0 },
    { hp: 24, dps: 20, deathDamage: 9, cost: 80000, seconds: 10800, laboratory: 2 },
    { hp: 29, dps: 25, deathDamage: 13, cost: 200000, seconds: 14400, laboratory: 4 },
    { hp: 35, dps: 30, deathDamage: 16, cost: 450000, seconds: 43200, laboratory: 5 },
    { hp: 53, dps: 43, deathDamage: 23, cost: 1000000, seconds: 57600, laboratory: 6 },
  ],
};
export const troopProgression = (kind: TroopKind, level: number) =>
  TROOP_LEVELS[kind][level - 1];
