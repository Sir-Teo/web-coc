import nativeProgression from '../../reference/full-client/progression.json';
import { infernoStats } from './inferno-weapon';
import { cannonStats } from './cannon-stats';
import { castleStats } from './castle-art';
import { mortarStats } from './mortar-stats';
import { darkStorageStats } from './dark-storage-stats';
import type { BuildingKind } from './data';
import { XBOW_LEVELS } from './xbow-stats';
import { teslaStats } from './tesla-stats';
import { bombTowerStats } from './bomb-tower-stats';
import { seekingMineStats } from './seeking-mine-stats';
import { wizardTowerStats } from './wizard-tower-stats';
import { SWEEPER_LEVELS } from './air-control-stats';

/** TH1–8 compatibility ceilings followed by pinned TH9–18 progression. */
const BASE_BUILDING_LEVELS = {
  inferno: [0, 0, 0, 0, 0, 0, 0, 0],
  clancastle: [0, 0, 0, 0, 0, 0, 0, 0],
  xbow: [0, 0, 0, 0, 0, 0, 0, 0],
  blacksmith: [0, 0, 0, 0, 0, 0, 0, 1],
  townhall: [8, 8, 8, 8, 8, 8, 8, 8],
  goldmine: [1, 4, 6, 8, 10, 10, 11, 12],
  collector: [1, 4, 6, 8, 10, 10, 11, 12],
  goldstorage: [1, 3, 6, 8, 9, 10, 11, 11],
  elixirstorage: [1, 3, 6, 8, 9, 10, 11, 11],
  barracks: [1, 4, 5, 6, 7, 8, 9, 10],
  cannon: [1, 3, 4, 5, 6, 7, 8, 10],
  archertower: [0, 2, 3, 4, 6, 7, 8, 10],
  camp: [1, 2, 3, 4, 5, 6, 6, 6],
  builder: [1, 1, 1, 1, 1, 1, 1, 1],
  mortar: [0, 0, 1, 2, 3, 4, 5, 6],
  airsweeper: [0, 0, 0, 0, 0, 2, 3, 4],
  tesla: [0, 0, 0, 0, 0, 0, 3, 6],
  bombtower: [0, 0, 0, 0, 0, 0, 0, 2],
  skeletontrap: [0, 0, 0, 0, 0, 0, 0, 2],
  seekingairmine: [0, 0, 0, 0, 0, 0, 1, 1],
  airdefense: [0, 0, 0, 2, 3, 4, 5, 6],
  laboratory: [0, 0, 1, 2, 3, 4, 5, 6],
  spellfactory: [0, 0, 0, 0, 1, 2, 3, 3],
  wizardtower: [0, 0, 0, 0, 2, 3, 4, 6],
  bomb: [0, 0, 2, 2, 3, 3, 4, 5],
  giantbomb: [0, 0, 0, 0, 0, 2, 2, 3],
  airbomb: [0, 0, 0, 0, 2, 2, 3, 3],
  springtrap: [0, 0, 0, 1, 1, 1, 2, 3],
  wall: [0, 2, 3, 4, 5, 6, 7, 8],
  herohall: [0, 0, 0, 1, 1, 1, 1, 2],
  darkdrill: [0, 0, 0, 0, 0, 0, 3, 3],
  darkstorage: [0, 0, 0, 0, 0, 0, 2, 4],
};

export const BUILDING_LEVELS: Record<BuildingKind, readonly number[]> = Object.fromEntries(
  Object.entries(nativeProgression.buildings).map(([kind, family]) => [
    kind,
    kind in BASE_BUILDING_LEVELS
      ? BASE_BUILDING_LEVELS[kind as keyof typeof BASE_BUILDING_LEVELS]
      : Array.from({ length: 8 }, (_, i) =>
          Math.max(
            0,
            ...family.levels.filter((row) => row.townhall <= i + 1).map((row) => row.level),
          ),
        ),
  ]),
) as unknown as Record<BuildingKind, readonly number[]>;
for (const kind of Object.keys(BUILDING_LEVELS) as BuildingKind[]) {
  const native = nativeProgression.buildings[kind];
  BUILDING_LEVELS[kind] = [
    ...(kind === 'townhall' ? Array(8).fill(18) : BUILDING_LEVELS[kind]),
    ...Array.from({ length: 10 }, (_, i) => {
      const th = i + 9;
      return kind === 'townhall'
        ? 18
        : Math.max(0, ...native.levels.filter((r) => r.townhall <= th).map((r) => r.level));
    }),
  ];
}

export const requiredTownHall = (kind: BuildingKind, level: number) => {
  if (kind === 'townhall') return level >= 1 && level <= 18 ? Math.max(1, level - 1) : null;
  const native = nativeProgression.buildings[kind].levels[level - 1];
  if (native && native.townhall > 8) return native.townhall;
  if (kind === 'inferno')
    return Number.isInteger(level) && level >= 1 && level <= 12
      ? infernoStats(level).townhall
      : null;
  if (kind === 'clancastle') return castleStats(level)?.townhall ?? null;
  if (kind === 'cannon') return cannonStats(level)?.townhall ?? null;
  if (kind === 'mortar') return mortarStats(level)?.townhall ?? null;
  if (kind === 'airsweeper') return SWEEPER_LEVELS[level - 1]?.townhall ?? null;
  if (kind === 'wizardtower') return wizardTowerStats(level)?.townhall ?? null;
  if (kind === 'bombtower') return bombTowerStats(level)?.townhall ?? null;
  if (kind === 'tesla') return teslaStats(level)?.townhall ?? null;
  if (kind === 'darkstorage') return darkStorageStats(level)?.townhall ?? null;
  if (kind === 'xbow') return XBOW_LEVELS[level - 1]?.townhall ?? null;
  // Level-one source trap rows use TH1; the actual purchase unlock is TH7.
  if (kind === 'seekingairmine' && level > 1) return seekingMineStats(level)?.townhall ?? null;
  // Native trap rows retain later requirements even while the home village caps at TH8.
  if (kind === 'skeletontrap' && (level === 3 || level === 4)) return level + 6;
  const index = BUILDING_LEVELS[kind].findIndex((cap) => cap >= level);
  return index < 0 ? null : index + 1;
};
