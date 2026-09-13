import { TROOPS } from './data';
import type { Battle } from './model';
import { spawnGarrisonDefender } from './garrison-combat';
import {
  createGarrisonReserve,
  releaseGarrisonTroop,
  type GarrisonReserve,
  type GarrisonTroop,
} from './garrison-reserve';

export interface GarrisonSetup {
  castleId: number;
  mode: 'guard' | 'sleep';
  troops: GarrisonTroop[];
}
export interface GarrisonState extends GarrisonReserve {
  nextSearch: number;
}
export const initializeGarrison = (setup: GarrisonSetup): GarrisonState => ({
  ...createGarrisonReserve(setup.castleId, setup.troops, setup.mode),
  nextSearch: 0,
});
/** Older-engine 320ms countdown plus the following 64ms search tick; modern parity pending. */
export const GARRISON_SEARCH_SECONDS = 0.384;
const searchTime = (index: number) => (index * 384) / 1000;
const exits = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export function stepGarrisonReleases(battle: Battle) {
  for (const reserve of battle.garrisons ?? []) {
    const castle = battle.buildings.find(
      (b) => b.id === reserve.castleId && b.kind === 'clancastle',
    );
    if (!castle) continue;
    const centerX = castle.x + 1.5,
      centerY = castle.y + 1.5;
    const targets = battle.units.map((unit) => ({ ...unit, flying: !!TROOPS[unit.kind].flying }));
    while (searchTime(reserve.nextSearch) <= battle.elapsed + 1e-9) {
      const at = searchTime(reserve.nextSearch++);
      const troop = releaseGarrisonTroop(
        reserve,
        { id: castle.id, hp: castle.hp, centerX, centerY },
        targets,
        at,
      );
      if (!troop) continue;
      const [dx, dy] = exits[troop.ordinal % exits.length];
      spawnGarrisonDefender(
        battle,
        troop.kind,
        troop.level,
        castle.id,
        centerX + dx * 1.25,
        centerY + dy * 1.25,
        at,
      );
    }
  }
}
