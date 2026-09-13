import { ARCHER_TOWER_LEVELS, ARCHER_TOWER } from './archer-tower-stats';
import infernoCatalog from '../../reference/inferno/catalog.json';
import { CANNON_LEVELS, CANNON } from './cannon-stats';
import { MORTAR_LEVELS, MORTAR } from './mortar-stats';
import type { BuildingKind } from './data';
import { XBOW_LEVELS, XBOW } from './xbow-stats';
import { TESLA_LEVELS, TESLA } from './tesla-stats';
import { BOMB_TOWER_LEVELS, BOMB_TOWER } from './bomb-tower-stats';
import { WIZARD_TOWER_LEVELS, WIZARD_TOWER } from './wizard-tower-stats';

/** Undiscounted destination-level values. See the defense progression audits in docs/. */
export const DEFENSE_PROGRESSION = {
  inferno: infernoCatalog.levels.map((row) => ({ ...row, dps: row.weapon.dps[0] })),
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
  cannon: CANNON_LEVELS,
  mortar: MORTAR_LEVELS,
  archertower: ARCHER_TOWER_LEVELS,
} as const;

/** Normal mode; geared-up variants are not yet supported. */
export const DEFENSE_WEAPONS = {
  inferno: { range: 9, rate: 0.128 },
  xbow: { range: XBOW.groundRange, rate: XBOW.interval },
  bombtower: { range: BOMB_TOWER.range, rate: BOMB_TOWER.interval, splash: BOMB_TOWER.splash },
  tesla: { range: TESLA.range, rate: TESLA.interval },
  airdefense: { range: 10, rate: 1 },
  wizardtower: {
    range: WIZARD_TOWER.range,
    rate: WIZARD_TOWER.interval,
    splash: WIZARD_TOWER.splash,
  },
  cannon: { range: CANNON.range, rate: CANNON.interval },
  mortar: {
    range: MORTAR.range,
    minRange: MORTAR.minRange,
    rate: MORTAR.interval,
    splash: MORTAR.splash,
  },
  archertower: { range: ARCHER_TOWER.range, rate: ARCHER_TOWER.interval },
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
