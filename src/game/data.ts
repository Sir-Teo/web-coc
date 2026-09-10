export type BuildingKind =
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
  | 'wall';
export type TroopKind =
  'swordsman' | 'archer' | 'giant' | 'wizard' | 'balloon' | 'goblin' | 'wallbreaker';
export type SpellKind = 'rage' | 'heal' | 'lightning';
export type Resource = 'gold' | 'elixir';
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
  category: 'Army' | 'Resources' | 'Defenses';
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
}
const ALWAYS = (n: number) => Object.freeze(Array<number>(8).fill(n));
export const MAX_TOWNHALL = 8;
/** Laboratory level N unlocks troop level N, so the two ceilings must match. */
export const MAX_TROOP_LEVEL = 5;
export const BUILDINGS: Record<BuildingKind, BuildingDef> = {
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
    maxLevel: 10,
    available: [2, 3, 4, 5, 6, 7, 7, 7],
    build: 45,
  },
  collector: {
    name: 'Elixir Collector',
    description: 'Draws magical elixir from deep underground to train your army.',
    size: 3,
    width: 115,
    hp: 650,
    cost: 1800,
    resource: 'gold',
    category: 'Resources',
    maxLevel: 10,
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
    maxLevel: 10,
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
    maxLevel: 10,
    available: [1, 2, 2, 3, 3, 4, 4, 4],
    build: 90,
  },
  barracks: {
    name: 'Barracks',
    description: 'Train your troops here. Each extra barracks shortens training times.',
    size: 3,
    width: 134,
    hp: 850,
    cost: 4500,
    resource: 'elixir',
    category: 'Army',
    maxLevel: 8,
    available: [1, 2, 2, 3, 3, 4, 4, 4],
    build: 120,
  },
  cannon: {
    name: 'Cannon',
    description: 'A dependable defense with a powerful punch. Ground troops only.',
    size: 2,
    width: 94,
    hp: 900,
    cost: 6000,
    resource: 'gold',
    category: 'Defenses',
    maxLevel: 12,
    available: [2, 3, 4, 5, 5, 6, 6, 7],
    build: 60,
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
    hp: 750,
    cost: 8000,
    resource: 'gold',
    category: 'Defenses',
    maxLevel: 12,
    available: [1, 2, 3, 4, 5, 5, 6, 6],
    build: 75,
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
    description: 'A cold-steel flak gun. Devastating against balloons — and blind to the ground.',
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
    maxLevel: MAX_TROOP_LEVEL,
    available: [0, 1, 1, 1, 1, 1, 1, 1],
    build: 180,
  },
  spellfactory: {
    name: 'Spell Factory',
    description: 'Brews battle spells. Each level holds one more spell in your army.',
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
  wall: {
    name: 'Stone Wall',
    description: 'Slows ground attackers and channels them toward your defenses.',
    size: 1,
    width: 47,
    hp: 500,
    cost: 150,
    resource: 'gold',
    category: 'Defenses',
    maxLevel: 12,
    available: [25, 50, 75, 100, 125, 150, 175, 200],
    build: 0,
  },
};
export interface TroopDef {
  name: string;
  role: string;
  description: string;
  hp: number;
  damage: number;
  speed: number;
  range: number;
  rate: number;
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
  /** New troops use a full-body sprite with movement driven by the scene. */
  staticSprite?: true;
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
    cost: 100,
    space: 1,
    time: 6,
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
    cost: 160,
    space: 1,
    time: 8,
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
    cost: 650,
    space: 5,
    time: 20,
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
    cost: 450,
    space: 4,
    time: 15,
    width: 30,
    research: 1200,
  },
  balloon: {
    name: 'Balloon',
    role: 'AIR',
    description: 'Drifts over walls to bomb defenses. Only air defenses can reach it.',
    hp: 780,
    damage: 190,
    speed: 0.62,
    range: 0.9,
    rate: 3,
    cost: 900,
    space: 5,
    time: 22,
    width: 34,
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
    cost: 120,
    space: 1,
    time: 7,
    width: 28,
    research: 480,
    prefersResources: true,
    staticSprite: true,
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
    cost: 350,
    space: 2,
    time: 12,
    width: 28,
    research: 720,
    wallBreaker: true,
    staticSprite: true,
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
    cost: 4500,
    space: 2,
    time: 90,
    radius: 4.4,
    duration: 12,
    effect: '+70% damage, +60% speed',
  },
  heal: {
    name: 'Healing Spell',
    role: 'SUPPORT',
    description: 'A ring of restoring light that mends your troops where they stand.',
    cost: 4000,
    space: 2,
    time: 80,
    radius: 4,
    duration: 12,
    effect: '55 health per second',
  },
  lightning: {
    name: 'Lightning Spell',
    role: 'DIRECT',
    description: 'Calls down bolts that damage every building in a small area.',
    cost: 3500,
    space: 1,
    time: 60,
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
/** Level at which a structure switches to its distinct late-game artwork. */
export const TIER3_LEVEL = 5;
const ENVIRONMENT = new Set(['wall', 'trees', 'rocks', 'flag']);
export const asset = (kind: string, level = 1) => {
  if (kind in SPELLS) return `/assets/spells/${kind}.webp`;
  if (level >= TIER3_LEVEL && kind in BUILDINGS && kind !== 'wall')
    return `/assets/buildings/tier3/${kind}.webp`;
  const folder =
    kind in TROOPS ? 'characters' : ENVIRONMENT.has(kind) ? 'environment' : 'buildings';
  return `/assets/${folder}/${kind}.webp`;
};
/**
 * Nothing may outrank the Town Hall by more than a single level, so a Town Hall
 * upgrade is what opens the next tier of everything else.
 */
export const maxLevelFor = (kind: BuildingKind, townhall: number) =>
  kind === 'townhall'
    ? BUILDINGS.townhall.maxLevel
    : Math.min(BUILDINGS[kind].maxLevel, townhall + 1);
export const maxCountFor = (kind: BuildingKind, townhall: number) =>
  BUILDINGS[kind].available[Math.min(MAX_TOWNHALL, Math.max(1, townhall)) - 1];
/** Seconds to take a building from `level` to `level + 1`. */
export const upgradeSeconds = (kind: BuildingKind, level: number) =>
  Math.round(BUILDINGS[kind].build * Math.pow(2.1, level - 1));
export const upgradeCost = (kind: BuildingKind, level: number) =>
  Math.floor(BUILDINGS[kind].cost * Math.pow(1.85, level));
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
