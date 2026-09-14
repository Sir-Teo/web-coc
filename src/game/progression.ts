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

/** TH1..TH9 upgrade ceilings. Source audit: docs/TOWNHALL-9.md and docs/HERO-PROGRESSION.md. */
export const BUILDING_LEVELS: Record<BuildingKind, readonly number[]> = {
  // Late single-player campaign entities are never purchasable in the TH1–9 home catalog.
  eagleartillery: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  scattershot: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  monolith: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  spelltower: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  tornadotrap: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  inferno: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  clancastle: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  xbow: [0, 0, 0, 0, 0, 0, 0, 0, 3],
  blacksmith: [0, 0, 0, 0, 0, 0, 0, 1, 1],
  // The Town Hall's own ceiling is the catalog maximum at every tier.
  townhall: [9, 9, 9, 9, 9, 9, 9, 9, 9],
  goldmine: [1, 4, 6, 8, 10, 10, 11, 12, 12],
  collector: [1, 4, 6, 8, 10, 10, 11, 12, 12],
  goldstorage: [1, 3, 6, 8, 9, 10, 11, 11, 11],
  elixirstorage: [1, 3, 6, 8, 9, 10, 11, 11, 11],
  barracks: [1, 4, 5, 6, 7, 8, 9, 10, 11],
  cannon: [1, 3, 4, 5, 6, 7, 8, 10, 11],
  archertower: [0, 2, 3, 4, 6, 7, 8, 10, 11],
  camp: [1, 2, 3, 4, 5, 6, 6, 6, 7],
  builder: [1, 1, 1, 1, 1, 1, 1, 1, 1],
  mortar: [0, 0, 1, 2, 3, 4, 5, 6, 7],
  airsweeper: [0, 0, 0, 0, 0, 2, 3, 4, 5],
  tesla: [0, 0, 0, 0, 0, 0, 3, 6, 7],
  bombtower: [0, 0, 0, 0, 0, 0, 0, 2, 3],
  skeletontrap: [0, 0, 0, 0, 0, 0, 0, 2, 3],
  seekingairmine: [0, 0, 0, 0, 0, 0, 1, 1, 2],
  airdefense: [0, 0, 0, 2, 3, 4, 5, 6, 7],
  laboratory: [0, 0, 1, 2, 3, 4, 5, 6, 7],
  spellfactory: [0, 0, 0, 0, 1, 2, 3, 3, 4],
  wizardtower: [0, 0, 0, 0, 2, 3, 4, 6, 7],
  bomb: [0, 0, 2, 2, 3, 3, 4, 5, 6],
  giantbomb: [0, 0, 0, 0, 0, 2, 2, 3, 3],
  airbomb: [0, 0, 0, 0, 2, 2, 3, 3, 4],
  springtrap: [0, 0, 0, 1, 1, 1, 2, 3, 4],
  wall: [0, 2, 3, 4, 5, 6, 7, 8, 10],
  herohall: [0, 0, 0, 1, 1, 1, 1, 2, 3],
  darkdrill: [0, 0, 0, 0, 0, 0, 3, 3, 6],
  darkstorage: [0, 0, 0, 0, 0, 0, 2, 4, 6],
};

export const requiredTownHall = (kind: BuildingKind, level: number) => {
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
  // Native trap rows retain later requirements even while the home village caps at TH9.
  if (kind === 'skeletontrap' && level === 4) return 10;
  const index = BUILDING_LEVELS[kind].findIndex((cap) => cap >= level);
  return index < 0 ? null : index + 1;
};
