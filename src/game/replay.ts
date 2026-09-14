import { MAX_ARCHER_TOWER_LEVEL } from './archer-tower-stats';
import { HERO_MAX_LEVEL } from './heroes';
import { MAX_DARK_DRILL_LEVEL } from './dark-drill-stats';
import { validInfernoAmmo, validInfernoMode } from './inferno-weapon';
import { isLateBuilding, isLateCampaignBuilding, validLateBuilding } from './late-campaign';
import {
  campaignStage,
  campaignStages,
  validCampaignCatalog,
  type CampaignCatalog,
} from './campaign-catalog';
import { NATIVE_SCENERY, type CampaignScenery } from './native-campaign';
import { validNpcBuilding, npcMaxLevel } from './npc-buildings';
import {
  validCampaignResources,
  campaignResources,
  campaignAmount,
  type CampaignResources,
} from './campaign-loot';
import { validDirection } from './air-control-stats';
import { validSkeletonMode } from './skeleton-stats';
import { validXbowMode } from './xbow-stats';
import { initializeGarrison, isGarrisonBunker, type GarrisonSetup } from './garrison-release';
import { createGarrisonReserve, MAX_GARRISON_TROOPS } from './garrison-reserve';
import { garrisonTroopVersion } from './garrison-kinds';
import { gridSize, footprintSize, type GridVersion } from './grid';
import {
  BUILDINGS,
  MAX_TOWNHALL,
  MAX_TROOP_LEVEL,
  maxTroopLevel,
  SPELL_KEYS,
  TROOP_KEYS,
  LEGACY_TROOP_KEYS,
} from './data';
import type { Army, Battle, Building, SpellBook } from './model';
import { MAX_SPELL_LEVEL, maxSpellLevelFor } from './spell-progression';
import {
  EQUIPMENT_LEVEL_BEFORE_47,
  EQUIPMENT_MAX_LEVEL,
  validEquipment,
  type KingEquipment,
} from './equipment';

// Bump when combat rules change; old results remain readable even if playback expires.
export const REPLAY_VERSION = 47;
/** Versions 34–35 preserve their prior Cannon rules; 34 also keeps fixed Mortar flight.
 * Version 44 adds late single-player campaign levels and entities without changing earlier rules.
 * Version 45 adds the Town Hall 9 home ceilings without changing any combat rule.
 * Version 46 carries the catalog to Town Hall 18, again with no combat rule change.
 * Version 47 adds the fifth Skeleton Trap tier, whose coffin releases level 2 skeletons,
 * and arms the home Builder's Hut with the turret campaign huts already carried. */
export const compatibleReplayVersion = (version: unknown) =>
  version === 34 ||
  version === 35 ||
  version === 36 ||
  version === 37 ||
  version === 38 ||
  version === 39 ||
  version === 40 ||
  version === 41 ||
  version === 42 ||
  version === 43 ||
  version === 44 ||
  version === 45 ||
  version === 46 ||
  version === REPLAY_VERSION;
/** Roster ceilings before version 47 took every troop and spell to its own original last level. */
const PRE_ROSTER_TROOP_LEVELS: Readonly<Record<string, number>> = Object.fromEntries(
  TROOP_KEYS.map((kind) => [
    kind,
    kind === 'healer' || kind === 'dragon' || kind === 'pekka' ? 3 : 5,
  ]),
);
const PRE_ROSTER_SPELL_LEVEL = 5;
/** Ceilings before version 47 reconstructed the fifth coffin tier. */
const PRE_VERSION_47_LEVELS: Readonly<Record<string, number>> = { skeletontrap: 4 };
/** Ceilings before version 46 carried the home catalog to Town Hall 18. */
const PRE_TOWNHALL_18_LEVELS: Readonly<Record<string, number>> = {
  townhall: 9,
  herohall: 3,
  darkdrill: 6,
  goldmine: 14,
  collector: 14,
  goldstorage: 16,
  elixirstorage: 16,
  archertower: 12,
  camp: 8,
  barracks: 11,
  laboratory: 7,
  spellfactory: 5,
  airdefense: 13,
  wall: 16,
  bomb: 11,
  giantbomb: 8,
  airbomb: 10,
  springtrap: 5,
};
/** Ceilings before version 45 raised the home catalog to Town Hall 9. */
const PRE_TOWNHALL_9_LEVELS: Readonly<Record<string, number>> = {
  barracks: 10,
  laboratory: 6,
  herohall: 2,
  darkdrill: 3,
};
/** Ceilings before version 44 added late single-player campaign levels. */
const PRE_LATE_CAMPAIGN_LEVELS: Readonly<Record<string, number>> = {
  wall: 12,
  goldstorage: 11,
  elixirstorage: 11,
  goldmine: 12,
  collector: 12,
  airdefense: 10,
  bomb: 8,
  giantbomb: 5,
  airbomb: 6,
};
export const REPLAY_LIMIT = 5;
export const MAX_REPLAY_STEPS = 60_000;
export const MAX_REPLAY_ACTIONS = 2000;
export const MAX_REPLAY_TROOPS = 700;
export const MAX_REPLAY_SPELLS = 100;
export const MAX_REPLAY_STEPS_PER_UPDATE = 100;
export const MAX_REPLAY_UPDATE_MS = 8;
export type ReplayAction = { step: number } & (
  | { type: 'troop'; kind: keyof Army; x: number; y: number }
  | { type: 'spell'; kind: keyof SpellBook; x: number; y: number }
  | { type: 'hero'; x: number; y: number }
  | { type: 'ability' }
  | { type: 'end' }
);
export interface ReplaySetup {
  garrisons?: GarrisonSetup[];
  catalog?: CampaignCatalog;
  scenery?: CampaignScenery[];
  index: number;
  practice: boolean;
  buildings: Building[];
  army: Army;
  spells: SpellBook;
  hero?: { level: number; townhall: number; equipment?: KingEquipment };
  troopLevels: Army;
  spellLevels?: SpellBook;
  nextId: number;
  /** Remaining enemy inventory at entry; never inferred from the viewer's progress. */
  availableLoot?: CampaignResources;
  /** Raid-limited storage headroom, not the player's balance or total capacity. */
  lootRoom?: CampaignResources;
}
export interface ReplayData {
  version: number;
  initial: ReplaySetup;
  /** Actual simulation deltas preserve ordering even in deterministic test advances. */
  steps: number[];
  actions: ReplayAction[];
}
export interface ReplayPlayback {
  recordId: number | null;
  seeking: boolean;
  seekTarget: number;
  paused: boolean;
  speed: 1 | 2 | 4;
  time: number;
  duration: number;
  complete: boolean;
}
export function replayBattle(s: ReplaySetup, version = REPLAY_VERSION): Battle {
  return {
    ...(version >= 44 && s.catalog === 'goblin-v1' ? { nativeSubtiles: true as const } : {}),
    // Late families step wherever they stand: campaign villages from version 44, late home
    // defenses and traps from version 46, and an armed Builder's Hut anywhere from version 47.
    ...((version >= 44 && s.catalog === 'goblin-v1' && s.buildings.some(isLateCampaignBuilding)) ||
    (version >= 46 && s.buildings.some(isLateBuilding)) ||
    (version >= 47 && s.buildings.some(isLateCampaignBuilding))
      ? { late: {} }
      : {}),
    ...(version >= 43 && s.buildings.some((b) => b.kind === 'inferno')
      ? { nativeInfernoAmmo: true as const }
      : {}),
    ...(version >= 42 && s.buildings.some((b) => b.kind === 'archertower')
      ? { archerTowerWindups: {} }
      : {}),
    ...(version >= 41 && s.buildings.some((b) => b.kind === 'archertower')
      ? { nativeArcherTowers: true as const }
      : {}),
    ...(version >= 40 && s.buildings.some((b) => b.kind === 'darkdrill')
      ? { drillDestructions: {} }
      : {}),
    // The battle seed orders different garrison troops of equal housing (no effect on older rosters).
    ...(s.garrisons
      ? { garrisons: s.garrisons.map((g) => initializeGarrison(g, 1337 + s.index)) }
      : {}),
    ...((version === 34 || version === 35) && s.buildings.some((b) => b.kind === 'cannon' && !b.npc)
      ? { legacyCannonFlight: true as const }
      : {}),
    ...(version === 34 && s.buildings.some((b) => b.kind === 'mortar')
      ? { legacyMortarFlight: true as const }
      : {}),
    ...(s.catalog ? { catalog: s.catalog } : {}),
    ...(s.scenery ? { scenery: structuredClone(s.scenery) } : {}),
    index: s.index,
    practice: s.practice,
    buildings: structuredClone(s.buildings),
    carriedArmy: { ...s.army },
    remaining: { ...s.army },
    carried: { ...s.spells },
    spells: { ...s.spells },
    troopLevels: { ...s.troopLevels },
    spellLevels: { lightning: 1, heal: 1, rage: 1, ...s.spellLevels },
    hero: s.hero
      ? { ...structuredClone(s.hero), unitId: null, abilityUsed: false, rageUntil: 0 }
      : undefined,
    units: [],
    auras: [],
    shells: [],
    defenseTargets: {},
    defenseStuns: {},
    traps: {},
    elapsed: 0,
    prep: s.practice ? 30 : 0,
    started: false,
    finished: false,
    destruction: 0,
    stars: 0,
    loot: { gold: 0, elixir: 0 },
    ...(s.lootRoom ? { lootRoom: { ...s.lootRoom } } : {}),
    ...(!s.practice
      ? {
          availableLoot: {
            ...(s.availableLoot ?? campaignResources(campaignStage(s.index, s.catalog))),
          },
          lootTaken: { gold: 0, elixir: 0 },
        }
      : {}),
    seed: 1337 + s.index,
  };
}
const object = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const number = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const integer = (v: unknown, min: number, max: number) =>
  number(v, min, max) && Number.isInteger(v);
const counts = (v: unknown, keys: readonly string[], min: number, max: number) =>
  object(v) && keys.every((k) => integer(v[k], min, max));
/** Treat imported recordings as untrusted, bounded input, independently of home layout. */
export function validateReplay(value: unknown): value is ReplayData {
  if (!object(value) || !integer(value.version, 1, 1000000) || !object(value.initial)) return false;
  const s = value.initial;
  const troopKeys = value.version >= 18 ? TROOP_KEYS : LEGACY_TROOP_KEYS;
  const equipmentCeiling = value.version < 47 ? EQUIPMENT_LEVEL_BEFORE_47 : EQUIPMENT_MAX_LEVEL;
  if (
    !validCampaignCatalog(s.catalog) ||
    (s.catalog !== undefined && value.version < 27) ||
    (s.practice && s.catalog === 'goblin-v1') ||
    !integer(s.index, 0, campaignStages(s.catalog).length - 1) ||
    typeof s.practice !== 'boolean' ||
    !integer(s.nextId, 1, Number.MAX_SAFE_INTEGER - 10000) ||
    !counts(s.army, troopKeys, 0, 9999) ||
    !counts(s.spells, SPELL_KEYS, 0, 999) ||
    !counts(s.troopLevels, troopKeys, 1, MAX_TROOP_LEVEL) ||
    // The roster reached each troop's own original ceiling in version 47; before that every
    // troop stopped at five and the Healer, Dragon and P.E.K.K.A at three.
    (value.version >= 18 &&
      TROOP_KEYS.some(
        (k) =>
          s.troopLevels[k] > (value.version < 47 ? PRE_ROSTER_TROOP_LEVELS[k] : maxTroopLevel(k)),
      )) ||
    (value.version >= 17 && !counts(s.spellLevels, SPELL_KEYS, 1, MAX_SPELL_LEVEL)) ||
    (s.spellLevels !== undefined &&
      SPELL_KEYS.some(
        (k) =>
          s.spellLevels![k] < 1 ||
          s.spellLevels![k] > (value.version < 47 ? PRE_ROSTER_SPELL_LEVEL : maxSpellLevelFor(k)),
      )) ||
    (value.version >= 4 &&
      (troopKeys.reduce((n, k) => n + s.army[k], 0) > MAX_REPLAY_TROOPS ||
        SPELL_KEYS.reduce((n, k) => n + s.spells[k], 0) > MAX_REPLAY_SPELLS)) ||
    (value.version >= 25 &&
      !s.practice &&
      !validCampaignResources(
        s.availableLoot,
        campaignStage(s.index, s.catalog),
        value.version >= 32 && campaignAmount(campaignStage(s.index, s.catalog), 'dark') > 0,
      )) ||
    (s.availableLoot !== undefined &&
      !validCampaignResources(s.availableLoot, campaignStage(s.index, s.catalog))) ||
    (value.version >= 4 && !s.practice && !object(s.lootRoom)) ||
    (s.lootRoom !== undefined &&
      (!object(s.lootRoom) ||
        !validCampaignResources(
          s.lootRoom,
          s.availableLoot ?? campaignStage(s.index, s.catalog),
          value.version >= 32 &&
            !s.practice &&
            campaignAmount(campaignStage(s.index, s.catalog), 'dark') > 0,
        ))) ||
    (s.hero !== undefined &&
      (!object(s.hero) ||
        !integer(
          s.hero.level,
          1,
          value.version < 45 ? 20 : value.version < 46 ? 30 : HERO_MAX_LEVEL,
        ) ||
        !integer(
          s.hero.townhall,
          4,
          value.version < 45 ? 8 : value.version < 46 ? 9 : MAX_TOWNHALL,
        ) ||
        // Equipment reached level 18 in version 47; every earlier recording stops at nine.
        (value.version >= 24 && !validEquipment(s.hero.equipment, equipmentCeiling)) ||
        (s.hero.equipment !== undefined && !validEquipment(s.hero.equipment, equipmentCeiling)))) ||
    !Array.isArray(s.buildings) ||
    !s.buildings.length ||
    // Version 44 admits complete late villages (Underground Workaround has 820 source entities).
    s.buildings.length > (value.version >= 44 ? 1000 : value.version >= 27 ? 600 : 400)
  )
    return false;
  if (
    s.scenery !== undefined &&
    (value.version < 27 ||
      s.catalog !== 'goblin-v1' ||
      !Array.isArray(s.scenery) ||
      s.scenery.length > 600 ||
      !s.scenery.every(
        (o: any) =>
          object(o) &&
          integer(o.data, 0, 1e9) &&
          Object.hasOwn(NATIVE_SCENERY, o.data) &&
          integer(o.x, 0, 48 - NATIVE_SCENERY[o.data].size) &&
          integer(o.y, 0, 48 - NATIVE_SCENERY[o.data].size),
      ))
  )
    return false;
  if (s.garrisons !== undefined) {
    if (value.version < 38 || !Array.isArray(s.garrisons) || s.garrisons.length > 20) return false;
    const castles = new Set<number>();
    let total = 0;
    for (const g of s.garrisons) {
      if (
        !object(g) ||
        !integer(g.castleId, 1, Number.MAX_SAFE_INTEGER) ||
        castles.has(g.castleId) ||
        !['guard', 'sleep'].includes(g.mode) ||
        !Array.isArray(g.troops) ||
        g.troops.length > MAX_GARRISON_TROOPS ||
        !s.buildings.some(
          (b: any) => object(b) && b.id === g.castleId && isGarrisonBunker(b as Building),
        )
      )
        return false;
      for (const troop of g.troops) {
        if (
          !object(troop) ||
          !integer(troop.level, 1, 100) ||
          !integer(troop.count, 1, MAX_GARRISON_TROOPS) ||
          // Dragon 7 and Balloon 8 exist since version 38; other kinds and levels since 44.
          (garrisonTroopVersion(troop.kind, troop.level) ?? Infinity) > value.version
        )
          return false;
        total += troop.count;
      }
      if (total > MAX_GARRISON_TROOPS) return false;
      try {
        createGarrisonReserve(g.castleId, g.troops, g.mode);
      } catch {
        return false;
      }
      castles.add(g.castleId);
    }
  }
  const ids = new Set<number>();
  const gridVersion: GridVersion = value.version < 12 ? 2 : value.version < 13 ? 3 : 4;
  const mapSize = gridSize(gridVersion);
  for (const b of s.buildings) {
    if (!object(b) || !Object.hasOwn(BUILDINGS, b.kind)) return false;
    const d = BUILDINGS[b.kind as keyof typeof BUILDINGS];
    const size = footprintSize(b.kind, d.size, gridVersion);
    if (
      !integer(b.id, 1, Number.MAX_SAFE_INTEGER) ||
      ids.has(b.id) ||
      !integer(b.x, 0, mapSize - size) ||
      !integer(b.y, 0, mapSize - size) ||
      !validDirection(b.direction) ||
      !validSkeletonMode(b.skeletonMode) ||
      !validXbowMode(b.xbowMode) ||
      !validInfernoMode(b.infernoMode) ||
      !validLateBuilding(b as Building, value.version, s.practice) ||
      !validInfernoAmmo(b.infernoAmmo, b.level) ||
      (b.infernoAmmo !== undefined && (b.kind !== 'inferno' || value.version < 43)) ||
      (b.infernoMode !== undefined && b.kind !== 'inferno') ||
      ((b.kind === 'inferno' || b.infernoMode !== undefined) && value.version < 39) ||
      (b.kind === 'clancastle' && value.version < 37) ||
      !integer(
        b.level,
        1,
        npcMaxLevel(b.npc) ??
          (b.kind === 'archertower' && value.version >= 42
            ? MAX_ARCHER_TOWER_LEVEL
            : b.kind === 'darkdrill' && value.version >= 40
              ? MAX_DARK_DRILL_LEVEL
              : ((value.version < 44 ? PRE_LATE_CAMPAIGN_LEVELS[b.kind] : undefined) ??
                (value.version < 45 ? PRE_TOWNHALL_9_LEVELS[b.kind] : undefined) ??
                (value.version < 46 ? PRE_TOWNHALL_18_LEVELS[b.kind] : undefined) ??
                (value.version < 47 ? PRE_VERSION_47_LEVELS[b.kind] : undefined) ??
                d.maxLevel)),
      ) ||
      !validNpcBuilding(b.npc, b.kind, b.level) ||
      (b.npc !== undefined && (s.practice || value.version < 26)) ||
      (b.npc === 'pumpkin-bomb' && value.version < 28) ||
      (b.npc === 'santa-trap' && value.version < 30) ||
      (b.npc === 'shrink-trap' && value.version < 34) ||
      (b.kind === 'skeletontrap' && b.level > 2 && value.version < 29) ||
      !number(b.maxHp, 1, 1e9) ||
      b.hp !== b.maxHp ||
      b.cooldown !== 0 ||
      !number(b.stored, 0, 1e12) ||
      (b.constructing !== undefined && typeof b.constructing !== 'boolean') ||
      (b.upgradeEnd !== undefined && !number(b.upgradeEnd, 0, Number.MAX_SAFE_INTEGER)) ||
      (b.upgradeStart !== undefined && !number(b.upgradeStart, 0, Number.MAX_SAFE_INTEGER))
    )
      return false;
    ids.add(b.id);
  }
  if (
    !Array.isArray(value.steps) ||
    value.steps.length > (value.version >= 25 ? MAX_REPLAY_STEPS : 6000) ||
    !value.steps.every((d) => number(d, 0.000001, 10)) ||
    value.steps.reduce((n, d) => n + d, 0) > (value.version >= 25 ? MAX_REPLAY_STEPS * 10 : 230) ||
    !Array.isArray(value.actions) ||
    !value.actions.length ||
    value.actions.length > MAX_REPLAY_ACTIONS
  )
    return false;
  let last = 0;
  for (const [i, a] of value.actions.entries()) {
    if (!object(a) || !integer(a.step, last, value.steps.length)) return false;
    last = a.step;
    if (a.type === 'end') {
      if (i !== value.actions.length - 1 || a.step !== value.steps.length) return false;
    } else if (a.type === 'ability') {
      if (!s.hero) return false;
    } else if (a.type === 'troop' || a.type === 'spell' || a.type === 'hero') {
      if (!number(a.x, 0, mapSize) || !number(a.y, 0, mapSize)) return false;
      if (a.type === 'troop' && !troopKeys.includes(a.kind)) return false;
      if (a.type === 'spell' && !SPELL_KEYS.includes(a.kind)) return false;
      if (a.type === 'hero' && !s.hero) return false;
    } else return false;
  }
  return value.actions.at(-1).type === 'end';
}
