import type { BuildingKind } from './data';

/** TH1..TH8 upgrade ceilings. Source audit: docs/HERO-PROGRESSION.md. */
export const BUILDING_LEVELS: Record<BuildingKind, readonly number[]> = {
  townhall: [8, 8, 8, 8, 8, 8, 8, 8],
  goldmine: [1, 4, 6, 8, 10, 10, 11, 12],
  collector: [1, 4, 6, 8, 10, 10, 11, 12],
  goldstorage: [1, 3, 6, 8, 9, 10, 11, 11],
  elixirstorage: [1, 3, 6, 8, 9, 10, 11, 11],
  barracks: [1, 4, 5, 6, 7, 8, 9, 10],
  cannon: [2, 3, 4, 5, 6, 7, 8, 10],
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

export const requiredTownHall = (kind: BuildingKind, level: number) => {
  const index = BUILDING_LEVELS[kind].findIndex((cap) => cap >= level);
  return index < 0 ? null : index + 1;
};
