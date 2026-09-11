import type { TroopKind } from './data';

/** Undiscounted Home Village values; each row describes its destination level.
 * Sources and conversion notes: docs/STARTER-TROOP-PROGRESSION.md.
 */
interface TroopLevel {
  hp: number;
  dps: number;
  cost: number;
  seconds: number;
  laboratory: number;
}
export const STARTER_TROOP_LEVELS: Readonly<Partial<Record<TroopKind, readonly TroopLevel[]>>> = {
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
};
export const troopProgression = (kind: TroopKind, level: number) =>
  STARTER_TROOP_LEVELS[kind]?.[level - 1];
