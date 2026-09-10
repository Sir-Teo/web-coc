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
  | 'laboratory'
  | 'wall';
export type TroopKind = 'swordsman' | 'archer' | 'giant' | 'wizard';
export type Resource = 'gold' | 'elixir';
export interface BuildingDef {
  name: string;
  description: string;
  size: number;
  width: number;
  hp: number;
  cost: number;
  resource: Resource;
  category: 'Army' | 'Resources' | 'Defenses';
  max: number;
  damage?: number;
  range?: number;
  rate?: number;
}
export const BUILDINGS: Record<BuildingKind, BuildingDef> = {
  townhall: {
    name: 'Town Hall',
    description: 'The heart of your village. Upgrade to strengthen your entire settlement.',
    size: 4,
    width: 174,
    hp: 2100,
    cost: 45000,
    resource: 'gold',
    category: 'Resources',
    max: 1,
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
    max: 5,
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
    max: 5,
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
    max: 3,
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
    max: 3,
  },
  barracks: {
    name: 'Barracks',
    description: 'Train your troops here. A great village deserves a great army.',
    size: 3,
    width: 134,
    hp: 850,
    cost: 4500,
    resource: 'elixir',
    category: 'Army',
    max: 2,
  },
  cannon: {
    name: 'Cannon',
    description: 'A dependable defense with a powerful punch against ground troops.',
    size: 2,
    width: 94,
    hp: 900,
    cost: 6000,
    resource: 'gold',
    category: 'Defenses',
    max: 5,
    damage: 32,
    range: 7,
    rate: 1.2,
  },
  archertower: {
    name: 'Archer Tower',
    description: 'A high vantage point and a long reach. Protects a wide area.',
    size: 2,
    width: 90,
    hp: 750,
    cost: 8000,
    resource: 'gold',
    category: 'Defenses',
    max: 4,
    damage: 20,
    range: 9,
    rate: 0.8,
  },
  camp: {
    name: 'Army Camp',
    description: 'Your troops gather here before battle. Every camp adds 20 army spaces.',
    size: 3,
    width: 133,
    hp: 700,
    cost: 3000,
    resource: 'elixir',
    category: 'Army',
    max: 4,
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
    max: 4,
  },
  mortar: {
    name: 'Mortar',
    description: 'Lobs explosive shells over walls to deal damage to groups of attackers.',
    size: 2,
    width: 93,
    hp: 1050,
    cost: 10000,
    resource: 'gold',
    category: 'Defenses',
    max: 3,
    damage: 48,
    range: 10,
    rate: 3,
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
    max: 1,
  },
  wall: {
    name: 'Stone Wall',
    description: 'Slows attackers and channels them toward your defenses.',
    size: 1,
    width: 47,
    hp: 500,
    cost: 150,
    resource: 'gold',
    category: 'Defenses',
    max: 150,
  },
};
export const TROOPS: Record<
  TroopKind,
  {
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
  }
> = {
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
    time: 3,
    width: 29,
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
    time: 4,
    width: 26,
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
    time: 8,
    width: 45,
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
    time: 6,
    width: 30,
  },
};
export const TROOP_KEYS = Object.keys(TROOPS) as TroopKind[];
export const asset = (kind: string, level = 1) =>
  level >= 3 && kind in BUILDINGS && kind !== 'wall'
    ? `/assets/buildings/tier3/${kind}.webp`
    : `/assets/${kind in TROOPS ? 'characters' : kind === 'wall' || kind === 'trees' || kind === 'rocks' || kind === 'flag' ? 'environment' : 'buildings'}/${kind}.webp`;
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
