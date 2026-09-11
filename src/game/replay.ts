import { gridSize, footprintSize, type GridVersion } from './grid';
import { BUILDINGS, CAMPAIGN, MAX_TROOP_LEVEL, SPELL_KEYS, TROOP_KEYS } from './data';
import type { Army, Battle, Building, SpellBook } from './model';

// Bump when combat rules change; old results remain readable even if playback expires.
export const REPLAY_VERSION = 13;
export const REPLAY_LIMIT = 5;
export const MAX_REPLAY_STEPS = 6000;
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
  index: number;
  practice: boolean;
  buildings: Building[];
  army: Army;
  spells: SpellBook;
  hero?: { level: number; townhall: number };
  troopLevels: Army;
  nextId: number;
  /** Raid-limited storage headroom, not the player's balance or total capacity. */
  lootRoom?: { gold: number; elixir: number };
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
    index: s.index,
    practice: s.practice,
    buildings: structuredClone(s.buildings),
    carriedArmy: { ...s.army },
    remaining: { ...s.army },
    carried: { ...s.spells },
    spells: { ...s.spells },
    troopLevels: { ...s.troopLevels },
    hero: s.hero ? { ...s.hero, unitId: null, abilityUsed: false, rageUntil: 0 } : undefined,
    units: [],
    auras: [],
    shells: [],
    defenseTargets: {},
    traps: {},
    elapsed: 0,
    prep: 30,
    started: false,
    finished: false,
    destruction: 0,
    stars: 0,
    loot: { gold: 0, elixir: 0 },
    ...(s.lootRoom ? { lootRoom: { ...s.lootRoom } } : {}),
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
  if (
    !integer(s.index, 0, CAMPAIGN.length - 1) ||
    typeof s.practice !== 'boolean' ||
    !integer(s.nextId, 1, Number.MAX_SAFE_INTEGER - 10000) ||
    !counts(s.army, TROOP_KEYS, 0, 9999) ||
    !counts(s.spells, SPELL_KEYS, 0, 999) ||
    !counts(s.troopLevels, TROOP_KEYS, 1, MAX_TROOP_LEVEL) ||
    (value.version >= 4 &&
      (TROOP_KEYS.reduce((n, k) => n + s.army[k], 0) > MAX_REPLAY_TROOPS ||
        SPELL_KEYS.reduce((n, k) => n + s.spells[k], 0) > MAX_REPLAY_SPELLS)) ||
    (value.version >= 4 && !s.practice && !object(s.lootRoom)) ||
    (s.lootRoom !== undefined &&
      (!object(s.lootRoom) ||
        !integer(s.lootRoom.gold, 0, CAMPAIGN[s.index].gold) ||
        !integer(s.lootRoom.elixir, 0, CAMPAIGN[s.index].elixir))) ||
    (s.hero !== undefined &&
      (!object(s.hero) || !integer(s.hero.level, 1, 20) || !integer(s.hero.townhall, 4, 8))) ||
    !Array.isArray(s.buildings) ||
    !s.buildings.length ||
    s.buildings.length > 400
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
      !integer(b.level, 1, d.maxLevel) ||
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
    value.steps.length > MAX_REPLAY_STEPS ||
    !value.steps.every((d) => number(d, 0.000001, 10)) ||
    value.steps.reduce((n, d) => n + d, 0) > 230 ||
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
      if (a.type === 'troop' && !TROOP_KEYS.includes(a.kind)) return false;
      if (a.type === 'spell' && !SPELL_KEYS.includes(a.kind)) return false;
      if (a.type === 'hero' && !s.hero) return false;
    } else return false;
  }
  return value.actions.at(-1).type === 'end';
}
