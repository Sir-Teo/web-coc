import type { BuildingKind } from './data';
import { PUMPKIN_ART } from './pumpkin-bomb';
import { SANTA_ART } from './santa-art';

/** Native campaign identities, independent of the player's upgrade catalog.
 * `kind` is the engine archetype; `npc` retains the exact enemy identity in replays.
 * Source: public client 18.400.21 building/trap tables, pinned in reference/.
 */
export const NPC_BUILDINGS = {
  'santa-trap': {
    globalId: 12000007,
    kind: 'bomb',
    name: 'Santa Strike',
    hp: [1],
    texture: SANTA_ART.texture,
    size: 1,
  },
  'pumpkin-bomb': {
    globalId: 12000003,
    kind: 'bomb',
    name: 'Pumpkin Bomb',
    hp: [1],
    texture: PUMPKIN_ART.texture,
    size: 1,
  },
  'goblin-townhall': {
    globalId: 1000001,
    kind: 'townhall',
    name: 'Goblin Town Hall',
    hp: [400, 800, 1600, 2000, 2400, 2800, 3300, 3900],
    texture: 'goblin-townhall-v1',
    size: 4,
  },
  'goblin-hut': {
    globalId: 1000018,
    kind: 'builder',
    name: 'Goblin Hut',
    hp: [250],
    texture: 'goblin-hut-v1',
    size: 2,
  },
  'tutorial-cannon': {
    globalId: 1000060,
    kind: 'cannon',
    name: 'Cannon',
    hp: [250],
    texture: 'cannon',
    size: 3,
  },
} as const;
export type NpcBuildingKind = keyof typeof NPC_BUILDINGS;
export function validNpcBuilding(value: unknown, kind: BuildingKind, level: number) {
  if (value === undefined) return true;
  if (typeof value !== 'string' || !Object.hasOwn(NPC_BUILDINGS, value)) return false;
  const d = NPC_BUILDINGS[value as NpcBuildingKind];
  return d.kind === kind && Number.isInteger(level) && level >= 1 && level <= d.hp.length;
}
/** Native DamagePerSecond=2, AttackSpeed=800 ms; the player Cannon has 7 DPS. */
export const TUTORIAL_CANNON_DAMAGE = 2 * 0.8;
export const npcAsset = (npc: NpcBuildingKind) =>
  npc === 'santa-trap'
    ? SANTA_ART.asset
    : npc === 'pumpkin-bomb'
      ? PUMPKIN_ART.asset
      : npc === 'tutorial-cannon'
        ? '/assets/buildings/cannon.webp'
        : `/assets/buildings/${NPC_BUILDINGS[npc].texture}.webp`;
/** Foundation side corners measured after registration; anchor their center to the tile. */
export const npcArt = (npc: NpcBuildingKind) =>
  npc === 'santa-trap'
    ? SANTA_ART
    : npc === 'pumpkin-bomb'
      ? PUMPKIN_ART
      : npc === 'tutorial-cannon'
        ? undefined
        : {
            texture: NPC_BUILDINGS[npc].texture,
            width: (64 * NPC_BUILDINGS[npc].size * 512) / 430,
            originX: 0.5,
            originY: (npc === 'goblin-townhall' ? 288 : 294) / 512,
          };
