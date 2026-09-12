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
import { gridSize, footprintSize, type GridVersion } from './grid';
import {
  BUILDINGS,
  MAX_TROOP_LEVEL,
  maxTroopLevel,
  SPELL_KEYS,
  TROOP_KEYS,
  LEGACY_TROOP_KEYS,
} from './data';
import type { Army, Battle, Building, SpellBook } from './model';
import { MAX_SPELL_LEVEL } from './spell-progression';
import { validEquipment, type KingEquipment } from './equipment';

// Bump when combat rules change; old results remain readable even if playback expires.
export const REPLAY_VERSION = 32;
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
export function replayBattle(s: ReplaySetup): Battle {
  return {
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
    (value.version >= 18 && TROOP_KEYS.some((k) => s.troopLevels[k] > maxTroopLevel(k))) ||
    (value.version >= 17 && !counts(s.spellLevels, SPELL_KEYS, 1, MAX_SPELL_LEVEL)) ||
    (s.spellLevels !== undefined && !counts(s.spellLevels, SPELL_KEYS, 1, MAX_SPELL_LEVEL)) ||
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
        !integer(s.hero.level, 1, 20) ||
        !integer(s.hero.townhall, 4, 8) ||
        (value.version >= 24 && !validEquipment(s.hero.equipment)) ||
        (s.hero.equipment !== undefined && !validEquipment(s.hero.equipment)))) ||
    !Array.isArray(s.buildings) ||
    !s.buildings.length ||
    s.buildings.length > (value.version >= 27 ? 600 : 400)
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
      !integer(b.level, 1, npcMaxLevel(b.npc) ?? d.maxLevel) ||
      !validNpcBuilding(b.npc, b.kind, b.level) ||
      (b.npc !== undefined && (s.practice || value.version < 26)) ||
      (b.npc === 'pumpkin-bomb' && value.version < 28) ||
      (b.npc === 'santa-trap' && value.version < 30) ||
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
