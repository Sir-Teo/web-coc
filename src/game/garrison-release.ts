import { BUILDINGS, TROOPS } from './data';
import { nativeMiteJump } from './native-mite-jumps';
import type { Battle, Building } from './model';
import { spawnGarrisonDefender } from './garrison-combat';
import {
  createGarrisonReserve,
  releaseGarrisonTroop,
  type GarrisonReserve,
  type GarrisonTroop,
  type GarrisonTarget,
} from './garrison-reserve';

export interface GarrisonSetup {
  castleId: number;
  mode: 'guard' | 'sleep';
  troops: GarrisonTroop[];
}
export interface GarrisonState extends GarrisonReserve {
  nextSearch: number;
}
/** `seed` orders different troops of equal housing; replays derive it from the village. */
export const initializeGarrison = (setup: GarrisonSetup, seed = 0): GarrisonState => ({
  ...createGarrisonReserve(setup.castleId, setup.troops, setup.mode, seed),
  nextSearch: 0,
});
/**
 * Source bunkers (`Bunker=TRUE`): home Clan Castles, the campaign Goblin Castle (Clan Castle
 * archetype) and the 4×4 Foreboding Cave (Army Camp archetype, version 44 identity).
 */
export const isGarrisonBunker = (b: Pick<Building, 'kind' | 'npc'>) =>
  (b.kind === 'clancastle' && (b.npc === undefined || b.npc === 'goblin-castle')) ||
  (b.kind === 'camp' && b.npc === 'foreboding-cave');
const searchTime = (index: number) => (index * 384) / 1000;
const exits = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
/**
 * The pinned older engine places each exit at the building middle plus
 * `(widthInTiles << 8) - 128` internal units: half the footprint less a quarter tile
 * (1.25 tiles for a 3×3 Castle, 1.75 for the 4×4 Foreboding Cave).
 */
export const garrisonExitOffset = (size: number) => size / 2 - 0.25;

export function stepGarrisonReleases(battle: Battle) {
  const garrisons = battle.garrisons ?? [];
  if (!garrisons.length) return;
  // Nothing to do until some reserve's next search is due: previously every
  // garrison copied every unit every tick even when the loop below never fired.
  let due = false;
  for (const reserve of garrisons)
    if (searchTime(reserve.nextSearch) <= battle.elapsed + 1e-9) {
      due = true;
      break;
    }
  if (!due) return;
  const bunkers = new Map<number, Building>();
  for (const b of battle.buildings) if (isGarrisonBunker(b)) bunkers.set(b.id, b);
  // One snapshot per tick: defender spawns below never touch battle.units.
  // Boogers and source DoesNotOpenCC mite jumps fight defenders without pulling the reserve.
  const targets: GarrisonTarget[] = [];
  for (const unit of battle.units)
    if (
      unit.kind !== 'booger' &&
      unit.kind !== 'frostmite' &&
      !nativeMiteJump(battle, unit.kind) &&
      !(battle.nativeElectromites && unit.kind === 'electromite')
    )
      targets.push({ ...unit, flying: !!TROOPS[unit.kind].flying });
  for (const reserve of garrisons) {
    const castle = bunkers.get(reserve.castleId);
    if (!castle) continue;
    const size = BUILDINGS[castle.kind].size;
    const centerX = castle.x + size / 2,
      centerY = castle.y + size / 2,
      offset = garrisonExitOffset(size);
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
        centerX + dx * offset,
        centerY + dy * offset,
        at,
      );
    }
  }
}
