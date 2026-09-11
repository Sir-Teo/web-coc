import { defenseProgression, DEFENSE_PROGRESSION } from './defense-progression';
import { wallAsset } from './wall-art';
import { WALL_LEVELS, WALL_COUNTS } from './wall-stats';
import { BUILDING_LEVELS } from './progression';
export type BuildingKind =
  | 'herohall'
  | 'darkdrill'
  | 'darkstorage'
  | 'townhall'
  | 'goldmine'
  | 'collector'
  | 'goldstorage'
  | 'elixirstorage'
  | 'barracks'
  | 'cannon'
  | 'archertower'
  | 'camp'
  | 'builder'
  | 'mortar'
  | 'airdefense'
  | 'laboratory'
  | 'spellfactory'
  | 'wizardtower'
  | 'bomb'
  | 'giantbomb'
  | 'airbomb'
  | 'springtrap'
  | 'wall';
export type TroopKind =
  'swordsman' | 'archer' | 'giant' | 'wizard' | 'balloon' | 'goblin' | 'wallbreaker';
export type SpellKind = 'rage' | 'heal' | 'lightning';
export type Resource = 'gold' | 'elixir' | 'dark';
/** Which layer a defence can shoot at. Troops without `flying` are ground units. */
export type Targets = 'ground' | 'air' | 'both';
export interface BuildingDef {
  name: string;
  description: string;
  size: number;
  width: number;
  hp: number;
  cost: number;
  resource: Resource;
  category: 'Army' | 'Resources' | 'Defenses' | 'Traps';
  /** Highest level this building can ever reach, before the Town Hall gate. */
  maxLevel: number;
  /** Maximum count allowed at Town Hall level 1..8, indexed from zero. */
  available: readonly number[];
  /** Seconds to build the first level. Later levels scale from this. */
  build: number;
  damage?: number;
  range?: number;
  minRange?: number;
  rate?: number;
  targets?: Targets;
  splash?: number;
  /** Traps occupy village tiles but never block movement, deployment or targeting. */
  trap?: {
    trigger: number;
    radius: number;
    delay: number;
    damage: number;
    targets: 'ground' | 'air';
    springCapacity?: number;
  };
  singleArtwork?: boolean;
}
const ALWAYS = (n: number) => Object.freeze(Array<number>(8).fill(n));
export const MAX_TOWNHALL = 8;
/** Local research roster currently supports five troop levels. */
export const MAX_TROOP_LEVEL = 5;
export const BUILDINGS: Record<BuildingKind, BuildingDef> = {
  herohall: {
    name: 'Hero Hall',
    description:
      'Home of the Barbarian King. Unlock your first hero here, then upgrade him from Town Hall 7.',
    size: 3,
    width: 140,
    hp: 1500,
    cost: 20000,
    resource: 'elixir',
    category: 'Army',
    maxLevel: 2,
    available: [0, 0, 0, 1, 1, 1, 1, 1],
    build: 180,
    singleArtwork: true,
  },
  darkdrill: {
    name: 'Dark Elixir Drill',
    description:
      'Extracts dark elixir to upgrade your heroes. Collect regularly to keep the drill working.',
    size: 3,
    width: 110,
    hp: 900,
    cost: 25000,
    resource: 'elixir',
    category: 'Resources',
    maxLevel: 3,
    available: [0, 0, 0, 0, 0, 0, 1, 2],
    build: 180,
    singleArtwork: true,
  },
  darkstorage: {
    name: 'Dark Elixir Storage',
    description: 'Protects dark elixir for hero upgrades. Every level adds 10,000 capacity.',
    size: 3,
    width: 110,
    hp: 1500,
    cost: 30000,
    resource: 'elixir',
    category: 'Resources',
    maxLevel: 4,
    available: [0, 0, 0, 0, 0, 0, 1, 1],
    build: 240,
    singleArtwork: true,
  },
  townhall: {
    name: 'Town Hall',
    description:
      'The heart of your village. Its level caps every other building and unlocks new ones.',
    size: 4,
    width: 174,
    hp: 2100,
    cost: 45000,
    resource: 'gold',
    category: 'Resources',
    maxLevel: MAX_TOWNHALL,
    available: ALWAYS(1),
    build: 300,
  },
  goldmine: {
    name: 'Gold Mine',
    description: 'Your miners turn the riches of the mountain into gold. Collect regularly.',
    size: 3,
    width: 122,
    hp: 650,
    cost: 1800,
    resource: 'elixir',
    category: 'Resources',
    maxLevel: 12,
    available: [2, 3, 4, 5, 6, 7, 7, 7],
    build: 45,
  },
  collector: {
    name: 'Elixir Collector',
    description: 'Draws magical elixir from deep underground for upgrades and research.',
    size: 3,
    width: 115,
    hp: 650,
    cost: 1800,
    resource: 'gold',
    category: 'Resources',
    maxLevel: 12,
    available: [2, 3, 4, 5, 6, 7, 7, 7],
    build: 45,
  },
  goldstorage: {
    name: 'Gold Storage',
    description: 'A well-guarded treasury. Each level expands your gold capacity.',
    size: 3,
    width: 115,
    hp: 1200,
    cost: 4000,
    resource: 'elixir',
    category: 'Resources',
    maxLevel: 11,
    available: [1, 2, 2, 3, 3, 4, 4, 4],
    build: 90,
  },
  elixirstorage: {
    name: 'Elixir Storage',
    description: 'Keep your elixir safe in this reinforced magical reservoir.',
    size: 3,
    width: 114,
    hp: 1200,
    cost: 4000,
    resource: 'gold',
    category: 'Resources',
    maxLevel: 11,
    available: [1, 2, 2, 3, 3, 4, 4, 4],
    build: 90,
  },
  barracks: {
    name: 'Barracks',
    description: 'Train your troops here. Prepare troops instantly, ready for your next attack.',
    size: 3,
    width: 134,
    hp: 850,
    cost: 4500,
    resource: 'elixir',
    category: 'Army',
    maxLevel: 10,
    available: [1, 2, 2, 3, 3, 4, 4, 4],
    build: 120,
  },
  cannon: {
    name: 'Cannon',
    description: 'A dependable defense with a powerful punch. Ground troops only.',
    size: 2,
    width: 94,
    hp: DEFENSE_PROGRESSION.cannon[0].hp,
    cost: DEFENSE_PROGRESSION.cannon[0].cost,
    resource: 'gold',
    category: 'Defenses',
    maxLevel: 12,
    available: [1, 2, 2, 2, 3, 3, 5, 5],
    build: DEFENSE_PROGRESSION.cannon[0].seconds,
    damage: 32,
    range: 7,
    rate: 1.2,
    targets: 'ground',
  },
  archertower: {
    name: 'Archer Tower',
    description: 'A high vantage point and a long reach. Fires at ground and air.',
    size: 2,
    width: 90,
    hp: DEFENSE_PROGRESSION.archertower[0].hp,
    cost: DEFENSE_PROGRESSION.archertower[0].cost,
    resource: 'gold',
    category: 'Defenses',
    maxLevel: 12,
    available: [0, 1, 1, 2, 3, 3, 4, 5],
    build: DEFENSE_PROGRESSION.archertower[0].seconds,
    damage: 20,
    range: 9,
    rate: 0.8,
    targets: 'both',
  },
  camp: {
    name: 'Army Camp',
    description: 'Your troops gather here before battle. Every level adds 20 army spaces.',
    size: 3,
    width: 133,
    hp: 700,
    cost: 3000,
    resource: 'elixir',
    category: 'Army',
    maxLevel: 8,
    available: [1, 2, 2, 3, 3, 4, 4, 4],
    build: 90,
  },
  builder: {
    name: 'Builder’s Hut',
    description: 'A home for your tireless builders. Adds one simultaneous construction slot.',
    size: 2,
    width: 92,
    hp: 500,
    cost: 12000,
    resource: 'gold',
    category: 'Army',
    maxLevel: 4,
    available: [2, 2, 3, 3, 4, 4, 5, 5],
    build: 30,
  },
  mortar: {
    name: 'Mortar',
    description:
      'Lobs shells at groups of ground attackers. Rush inside its 4-tile blind spot to avoid its fire.',
    size: 2,
    width: 93,
    hp: 1050,
    cost: 10000,
    resource: 'gold',
    category: 'Defenses',
    maxLevel: 10,
    available: [0, 1, 1, 2, 2, 3, 3, 4],
    build: 150,
    damage: 48,
    range: 10,
    minRange: 4,
    rate: 3,
    targets: 'ground',
  },
  airdefense: {
    name: 'Air Defense',
    description: 'An iron rocket battery. Devastating against balloons — and blind to the ground.',
    size: 3,
    width: 104,
    hp: 1100,
    cost: 14000,
    resource: 'gold',
    category: 'Defenses',
    maxLevel: 10,
    available: [0, 1, 2, 2, 3, 3, 4, 4],
    build: 180,
    damage: 110,
    range: 10,
    rate: 1,
    targets: 'air',
  },
  laboratory: {
    name: 'Laboratory',
    description: 'Research permanent troop upgrades. Higher levels unlock stronger troops.',
    size: 3,
    width: 122,
    hp: 950,
    cost: 15000,
    resource: 'elixir',
    category: 'Army',
    maxLevel: 6,
    available: [0, 1, 1, 1, 1, 1, 1, 1],
    build: 180,
  },
  spellfactory: {
    name: 'Spell Factory',
    description: 'Brews battle spells. Each level adds two housing spaces for battle spells.',
    size: 3,
    width: 122,
    hp: 900,
    cost: 18000,
    resource: 'elixir',
    category: 'Army',
    maxLevel: 5,
    available: [0, 1, 1, 1, 1, 1, 1, 1],
    build: 240,
  },
  wizardtower: {
    name: 'Wizard Tower',
    description:
      'A crystal lookout with a splash attack. Hits groups of ground or air troops, one layer at a time.',
    size: 3,
    width: 112,
    hp: 900,
    cost: 16000,
    resource: 'gold',
    category: 'Defenses',
    maxLevel: 8,
    available: [0, 0, 0, 0, 1, 2, 2, 3],
    build: 180,
    damage: 35,
    range: 7,
    rate: 1.3,
    targets: 'both',
    splash: 1.5,
    singleArtwork: true,
  },
  bomb: {
    name: 'Bomb',
    description:
      'Hidden until a ground troop approaches. A short fuse gives fast troops a chance to escape the blast.',
    size: 1,
    width: 39,
    hp: 1,
    cost: 400,
    resource: 'gold',
    category: 'Traps',
    maxLevel: 8,
    available: [0, 2, 2, 2, 4, 4, 6, 6],
    build: 10,
    singleArtwork: true,
    trap: { trigger: 1.5, radius: 3, delay: 1, damage: 25, targets: 'ground' },
  },
  giantbomb: {
    name: 'Giant Bomb',
    description:
      'A powerful hidden blast for groups of ground troops. Place beside a gap in your walls.',
    size: 2,
    width: 70,
    hp: 1,
    cost: 6000,
    resource: 'gold',
    category: 'Traps',
    maxLevel: 5,
    available: [0, 0, 0, 0, 1, 1, 2, 3],
    build: 60,
    singleArtwork: true,
    trap: { trigger: 2, radius: 3.5, delay: 1.5, damage: 175, targets: 'ground' },
  },
  airbomb: {
    name: 'Air Bomb',
    description:
      'A concealed balloon bomb that tracks an air troop and bursts among nearby flyers. Ground troops never trigger it.',
    size: 1,
    width: 44,
    hp: 1,
    cost: 4000,
    resource: 'gold',
    category: 'Traps',
    maxLevel: 6,
    available: [0, 0, 0, 2, 2, 2, 2, 4],
    build: 45,
    singleArtwork: true,
    trap: { trigger: 4, radius: 3, delay: 0.9, damage: 120, targets: 'air' },
  },
  springtrap: {
    name: 'Spring Trap',
    description:
      'Springs the largest ground troop in range out of battle. Oversized troops take damage and are knocked back instead.',
    size: 1,
    width: 44,
    hp: 1,
    cost: 2500,
    resource: 'gold',
    category: 'Traps',
    maxLevel: 5,
    available: [0, 0, 0, 2, 2, 4, 4, 6],
    build: 30,
    singleArtwork: true,
    trap: {
      trigger: 0.8,
      radius: 0.8,
      delay: 0,
      damage: 500,
      targets: 'ground',
      springCapacity: 10,
    },
  },
  wall: {
    name: 'Wall',
    description: 'Slows ground attackers and channels them toward your defenses.',
    size: 1,
    width: 47,
    hp: WALL_LEVELS[0].hp,
    cost: WALL_LEVELS[0].cost,
    resource: 'gold',
    category: 'Defenses',
    maxLevel: 12,
    available: WALL_COUNTS,
    build: 0,
  },
};
for (const kind of Object.keys(BUILDINGS) as BuildingKind[]) {
  BUILDINGS[kind].available = BUILDINGS[kind].available.map((count, i) =>
    BUILDING_LEVELS[kind][i] ? count : 0,
  );
}
export interface TroopDef {
  name: string;
  role: string;
  description: string;
  hp: number;
  damage: number;
  speed: number;
  range: number;
  rate: number;
  /** Radius of attack splash; death blasts are specified separately. */
  splash?: number;
  cost: number;
  space: number;
  time: number;
  width: number;
  /** Seconds for the first laboratory research. Later levels scale from this. */
  research: number;
  /** Flying troops ignore walls and pathing, and only air-capable defences hit them. */
  flying?: true;
  /** Prefers defensive buildings, the way giants and balloons do in Clash of Clans. */
  prefersDefenses?: true;
  prefersResources?: true;
  wallBreaker?: true;
  /** Damage dealt to nearby buildings when this troop is destroyed. */
  deathDamage?: number;
  deathRadius?: number;
}
export const TROOPS: Record<TroopKind, TroopDef> = {
  swordsman: {
    name: 'Swordsman',
    role: 'MELEE',
    description: 'Fearless frontline fighters. Best deployed in a group.',
    hp: 200,
    damage: 25,
    speed: 1.45,
    range: 1,
    rate: 0.8,
    cost: 0,
    space: 1,
    time: 0,
    width: 29,
    research: 300,
  },
  archer: {
    name: 'Archer',
    role: 'RANGED',
    description: 'Picks off buildings from behind your frontline.',
    hp: 100,
    damage: 21,
    speed: 1.65,
    range: 4.8,
    rate: 1,
    cost: 0,
    space: 1,
    time: 0,
    width: 26,
    research: 420,
  },
  giant: {
    name: 'Giant',
    role: 'TANK',
    description: 'Soaks up damage and targets defensive buildings first.',
    hp: 1250,
    damage: 45,
    speed: 0.95,
    range: 1.1,
    rate: 1.5,
    cost: 0,
    space: 5,
    time: 0,
    width: 45,
    research: 900,
    prefersDefenses: true,
  },
  wizard: {
    name: 'Wizard',
    role: 'SPLASH',
    description: 'Hurls fireballs that damage nearby buildings.',
    hp: 155,
    damage: 66,
    speed: 1.35,
    range: 4.5,
    rate: 1.6,
    splash: 3,
    cost: 0,
    space: 4,
    time: 0,
    width: 30,
    research: 1200,
  },
  balloon: {
    name: 'Balloon',
    role: 'AIR',
    description: 'Drifts over walls and drops bombs that blast nearby buildings. Only air-targeting defenses can reach it.',
    hp: 780,
    damage: 190,
    speed: 0.62,
    range: 0.9,
    rate: 3,
    splash: 1.2,
    cost: 0,
    space: 5,
    time: 0,
    width: 50,
    research: 1500,
    flying: true,
    prefersDefenses: true,
    deathDamage: 120,
    deathRadius: 1.8,
  },
  goblin: {
    name: 'Goblin',
    role: 'LOOT',
    description:
      'Sprints for mines, collectors, storages and the Town Hall. Deals double damage to resources.',
    hp: 95,
    damage: 22,
    speed: 2.7,
    range: 0.8,
    rate: 0.8,
    cost: 0,
    space: 1,
    time: 0,
    width: 28,
    research: 480,
    prefersResources: true,
  },
  wallbreaker: {
    name: 'Wall Breaker',
    role: 'BREACH',
    description:
      'Runs at walls protecting buildings and sacrifices itself in a blast. Bombs deal 40× damage to walls.',
    hp: 110,
    damage: 20,
    speed: 2.25,
    range: 0.7,
    rate: 1,
    cost: 0,
    space: 2,
    time: 0,
    width: 28,
    research: 720,
    wallBreaker: true,
    deathDamage: 8,
    deathRadius: 1.6,
  },
};
/** Stable keyboard assignments shared by the cards and keyboard handler. */
export const TROOP_HOTKEYS = ['1', '2', '3', '4', '5', '6', '7'];
export const SPELL_HOTKEYS = ['8', '9', '0'];
export const isResourceBuilding = (kind: BuildingKind) =>
  ['townhall', 'goldmine', 'collector', 'goldstorage', 'elixirstorage'].includes(kind);
export interface SpellDef {
  name: string;
  role: string;
  description: string;
  cost: number;
  space: number;
  time: number;
  radius: number;
  /** Seconds the aura lasts. Zero means the spell resolves the instant it lands. */
  duration: number;
  effect: string;
}
export const SPELLS: Record<SpellKind, SpellDef> = {
  rage: {
    name: 'Rage Spell',
    role: 'BOOST',
    description: 'Troops inside the cloud hit harder and move faster.',
    cost: 0,
    space: 2,
    time: 0,
    radius: 4.4,
    duration: 12,
    effect: '+70% damage, +60% speed',
  },
  heal: {
    name: 'Healing Spell',
    role: 'SUPPORT',
    description: 'A ring of restoring light that mends your troops where they stand.',
    cost: 0,
    space: 2,
    time: 0,
    radius: 4,
    duration: 12,
    effect: '55 health per second',
  },
  lightning: {
    name: 'Lightning Spell',
    role: 'DIRECT',
    description: 'Calls down bolts that damage every building in a small area.',
    cost: 0,
    space: 1,
    time: 0,
    radius: 2.3,
    duration: 0,
    effect: '480 damage instantly',
  },
};
export const LIGHTNING_DAMAGE = 480;
export const HEAL_PER_SECOND = 55;
export const TROOP_KEYS = Object.keys(TROOPS) as TroopKind[];
export const SPELL_KEYS = Object.keys(SPELLS) as SpellKind[];
export const BUILDING_KEYS = Object.keys(BUILDINGS) as BuildingKind[];
export const isTrap = (kind: BuildingKind) => !!BUILDINGS[kind].trap;
export const unlockTownHall = (kind: BuildingKind) =>
  BUILDINGS[kind].available.findIndex((n) => n > 0) + 1;
export const trapDamage = (kind: BuildingKind, level: number) =>
  Math.round((BUILDINGS[kind].trap?.damage ?? 0) * (1 + (level - 1) * 0.2));
export const springCapacity = (level: number) => 10 + (level - 1) * 2;
/** Level at which a structure switches to its distinct late-game artwork. */
export const TIER3_LEVEL = 5;
const ENVIRONMENT = new Set(['wall', 'trees', 'rocks', 'flag']);
const ORIGINAL_ART = new Set(['airdefense', 'spellfactory', 'balloon']);
const artName = (kind: string) => `${kind}${ORIGINAL_ART.has(kind) ? '-v2' : ''}`;
export const walkAsset = (kind: string) => `/assets/characters/walk/${artName(kind)}.webp`;
export const asset = (kind: string, level = 1) => {
  if (kind === 'wall') return wallAsset(level);
  if (kind === 'king') return '/assets/characters/king.webp';
  if (kind in SPELLS) return `/assets/spells/${kind}.webp`;
  if (
    level >= TIER3_LEVEL &&
    kind in BUILDINGS &&
    kind !== 'wall' &&
    !BUILDINGS[kind as BuildingKind].singleArtwork
  )
    return `/assets/buildings/tier3/${artName(kind)}.webp`;
  const folder =
    kind in TROOPS ? 'characters' : ENVIRONMENT.has(kind) ? 'environment' : 'buildings';
  return `/assets/${folder}/${artName(kind)}.webp`;
};
/** Explicit catalog ceilings; old villages retain existing buildings above them. */
export const maxLevelFor = (kind: BuildingKind, townhall: number) =>
  Math.min(BUILDINGS[kind].maxLevel, BUILDING_LEVELS[kind][Math.min(8, Math.max(1, townhall)) - 1]);
export const maxCountFor = (kind: BuildingKind, townhall: number) =>
  BUILDINGS[kind].available[Math.min(MAX_TOWNHALL, Math.max(1, townhall)) - 1];
/** Seconds to take a building from `level` to `level + 1`. */
export const upgradeSeconds = (kind: BuildingKind, level: number) =>
  defenseProgression(kind, level + 1)?.seconds ??
  Math.round(BUILDINGS[kind].build * Math.pow(2.1, level - 1));
/** Local economy: preserve early saves; higher storage tiers fund the expanded catalog. */
export const storageCapacity = (level: number) =>
  level <= 5 ? level * 60000 : Math.floor(300000 * Math.pow(1.5, level - 5));
/** Hitpoints shared by construction, upgrades, restored villages and the Info panel. */
export const buildingHp = (kind: BuildingKind, level: number) =>
  defenseProgression(kind, level)?.hp ??
  (kind === 'wall'
    ? WALL_LEVELS[Math.min(WALL_LEVELS.length, Math.max(1, level)) - 1].hp
    : BUILDINGS[kind].hp * (1 + (level - 1) * 0.25));
/** Cost of the destination level; audited buildings use undiscounted Home Village tables. */
export const upgradeCost = (kind: BuildingKind, level: number) =>
  defenseProgression(kind, level + 1)?.cost ??
  (kind === 'wall'
    ? (WALL_LEVELS[level]?.cost ?? 0)
    : Math.floor(BUILDINGS[kind].cost * Math.pow(1.85, level)));
export const researchSeconds = (kind: TroopKind, level: number) => TROOPS[kind].research * level;
/** Defences hit 12% harder per level, which is what a defence upgrade buys. */
export const defenseDamage = (kind: BuildingKind, level: number) =>
  (BUILDINGS[kind].damage ?? 0) * (1 + (level - 1) * 0.12);
export const researchCost = (kind: TroopKind, level: number) => {
  const base = {
    swordsman: 6000,
    archer: 8000,
    giant: 12000,
    wizard: 15000,
    balloon: 18000,
    goblin: 7000,
    wallbreaker: 10000,
  };
  return base[kind] * level;
};
/**
 * Gem prices follow the Clash of Clans shape: a minute is trivial, an hour is
 * cheap, and a multi-hour upgrade is a real decision.
 */
export function gemCost(seconds: number) {
  const s = Math.max(0, seconds);
  if (s <= 60) return 1;
  if (s <= 3600) return Math.ceil(1 + ((s - 60) / 3540) * 19);
  if (s <= 86400) return Math.ceil(20 + ((s - 3600) / 82800) * 240);
  return Math.ceil(260 + ((s - 86400) / 86400) * 130);
}
export const CAMPAIGN = [
  {
    name: 'Goblin Outpost',
    subtitle: 'A foothold in the valley',
    gold: 8500,
    elixir: 6500,
    difficulty: 'Easy',
  },
  {
    name: 'Timber Crossing',
    subtitle: 'Beyond the old river',
    gold: 12000,
    elixir: 10000,
    difficulty: 'Easy',
  },
  {
    name: 'Stonewatch',
    subtitle: 'Break through the defenses',
    gold: 16000,
    elixir: 14000,
    difficulty: 'Normal',
  },
  {
    name: 'The Copper Hills',
    subtitle: 'Riches behind the walls',
    gold: 20000,
    elixir: 18000,
    difficulty: 'Normal',
  },
  {
    name: 'Raven’s Nest',
    subtitle: 'Archers on the high ground',
    gold: 26000,
    elixir: 22000,
    difficulty: 'Normal',
  },
  {
    name: 'Ember Keep',
    subtitle: 'A fortress forged in fire',
    gold: 32000,
    elixir: 28000,
    difficulty: 'Hard',
  },
  {
    name: 'Moonwell',
    subtitle: 'The source of the elixir',
    gold: 38000,
    elixir: 35000,
    difficulty: 'Hard',
  },
  {
    name: 'Ironclad Valley',
    subtitle: 'Leave no wall standing',
    gold: 45000,
    elixir: 42000,
    difficulty: 'Hard',
  },
  {
    name: 'The Last Stronghold',
    subtitle: 'One final stand',
    gold: 60000,
    elixir: 55000,
    difficulty: 'Expert',
  },
  {
    name: 'Crown of the Valley',
    subtitle: 'Write your own legend',
    gold: 80000,
    elixir: 75000,
    difficulty: 'Expert',
  },
  {
    name: 'Ancient Citadel',
    subtitle: 'A forgotten kingdom awakens',
    gold: 95000,
    elixir: 90000,
    difficulty: 'Expert',
  },
  {
    name: 'King’s End',
    subtitle: 'The valley is yours to claim',
    gold: 120000,
    elixir: 110000,
    difficulty: 'Expert',
  },
];
