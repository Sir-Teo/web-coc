import { darkDrillStats, MAX_DARK_DRILL_LEVEL } from './dark-drill-stats';
import { hasLateArt, lateAsset, lateTexture } from './late-campaign-art';
import drillPortraits from '../../reference/dark-drill/portraits.json' with { type: 'json' };
import { infernoStats, type InfernoMode } from './inferno-weapon';
import { infernoAsset, infernoTexture } from './inferno-art';
import { cannonAsset, cannonTexture } from './cannon-art';
import { CASTLE_ART, CASTLE_LEVELS, castleAsset, castleTexture, castleStats } from './castle-art';
import { DARK_STORAGE_LEVELS, darkStorageStats } from './dark-storage-stats';
import { darkStorageAsset, darkStorageTexture } from './dark-storage-art';
import { TESLA_ART, TESLA_ART_LEVELS, teslaTexture, teslaAsset } from './tesla-art';
import { XBOW, XBOW_LEVELS, xbowDamage, type XbowMode } from './xbow-stats';
import { xbowAsset, xbowTexture } from './xbow-art';
import { BOMB_TOWER_ART, bombTowerTexture, bombTowerAsset } from './bomb-tower-art';
import { WIZARD_TOWER_ART, wizardTowerTexture, wizardTowerAsset } from './wizard-tower-art';
import { skeletonTrapTexture, skeletonTrapAsset } from './skeleton-art';
import type { SkeletonMode } from './skeleton-stats';
import { sweeperTexture, sweeperAsset } from './air-control-art';
import { seekingMineTexture, seekingMineAsset } from './seeking-mine-art';
import { SEEKING_MINE, SWEEPER, SWEEPER_LEVELS, sweeperStats } from './air-control-stats';
import { SEEKING_MINE_LEVELS } from './seeking-mine-stats';
import { campArt, campAsset, campTexture } from './camp-art';
import { CAMP_LEVELS, campProgression } from './camp-stats';
import { defenseProgression, DEFENSE_PROGRESSION, DEFENSE_WEAPONS } from './defense-progression';
import { MAX_ARCHER_TOWER_LEVEL } from './archer-tower-stats';
import { wallAsset, wallTexture } from './wall-art';
import { mortarAsset, mortarTexture } from './mortar-art';
import { TRAP_LEVELS, trapProgression } from './trap-stats';
import { WALL_LEVELS } from './wall-stats';
import { BUILDING_COUNTS, BUILDING_LEVELS, MAX_TOWNHALL } from './tiers';
import { troopProgression } from './troop-progression';
import {
  spellProgression,
  HEAL_PULSES,
  SPELL_PULSE_INTERVAL,
  RAGE_PULSES,
} from './spell-progression';
import { FACILITY_LEVELS, facilityProgression } from './facility-progression';
import { sourceLevel, sourceLevels, WORKER_GEMS } from './townhall-catalog';
import { SKELETON_TRAP_LEVELS } from './skeleton-stats';
/** Original level-one construction rows for the buildings that had no source table. */
const sourceBuild = (kind: BuildingKind) => sourceLevel(kind, 1)!;
/** Original row counts for the buildings whose ceiling is simply the end of their table. */
const SOURCE_ROWS = {
  goldmine: sourceLevels('goldmine')!.length,
  collector: sourceLevels('collector')!.length,
  goldstorage: sourceLevels('goldstorage')!.length,
  elixirstorage: sourceLevels('elixirstorage')!.length,
  herohall: sourceLevels('herohall')!.length,
  builder: sourceLevels('builder')!.length,
};
const SOURCE_BUILD = {
  goldmine: sourceBuild('goldmine'),
  collector: sourceBuild('collector'),
  goldstorage: sourceBuild('goldstorage'),
  elixirstorage: sourceBuild('elixirstorage'),
  herohall: sourceBuild('herohall'),
};
export type BuildingKind =
  | 'eagleartillery'
  | 'scattershot'
  | 'monolith'
  | 'spelltower'
  | 'tornadotrap'
  | 'inferno'
  | 'clancastle'
  | 'xbow'
  | 'blacksmith'
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
  | 'airsweeper'
  | 'tesla'
  | 'bombtower'
  | 'skeletontrap'
  | 'seekingairmine'
  | 'laboratory'
  | 'spellfactory'
  | 'wizardtower'
  | 'bomb'
  | 'giantbomb'
  | 'airbomb'
  | 'springtrap'
  | 'wall';
export type TroopKind =
  | 'swordsman'
  | 'archer'
  | 'giant'
  | 'wizard'
  | 'balloon'
  | 'goblin'
  | 'wallbreaker'
  | 'healer'
  | 'dragon'
  | 'pekka';
export type SpellKind = 'rage' | 'heal' | 'lightning';
export type ResearchKind = TroopKind | SpellKind;
export type Resource = 'gold' | 'elixir' | 'dark';
/** What a purchase is paid in. Gems buy Builder's Huts and nothing else is priced in them. */
export type Payment = Resource | 'gems';
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
    minHousing?: number;
    homingSpeed?: number;
  };
  singleArtwork?: boolean;
}
export { MAX_TOWNHALL, BUILDING_COUNTS } from './tiers';
/** Local research roster currently supports five troop levels. */
export const MAX_TROOP_LEVEL = 5;
export const maxTroopLevel = (kind: TroopKind) =>
  kind === 'healer' || kind === 'dragon' || kind === 'pekka' ? 3 : MAX_TROOP_LEVEL;
export const BUILDINGS: Record<BuildingKind, BuildingDef> = {
  // Late single-player campaign defenses. Their weapons are owned by their family modules;
  // omitting `damage` keeps them out of the ordinary defense loop.
  eagleartillery: {
    name: 'Eagle Artillery',
    description:
      'Has nearly unlimited range and targets tough enemies with exploding shells, but only activates after many troops are deployed.',
    size: 4,
    width: 200,
    hp: 4000,
    cost: 5000000,
    resource: 'gold',
    category: 'Defenses',
    maxLevel: 7,
    build: 345600,
    range: 50,
    minRange: 7,
    rate: 10,
    targets: 'both',
    singleArtwork: true,
  },
  scattershot: {
    name: 'Scattershot',
    description:
      'Heaves heavy objects at the closest attacker. The projectile breaks apart on impact and damages troops behind the target.',
    size: 3,
    width: 180,
    hp: 3600,
    cost: 8000000,
    resource: 'gold',
    category: 'Defenses',
    maxLevel: 7,
    build: 432000,
    range: 10,
    minRange: 3,
    rate: 3.228,
    targets: 'both',
    singleArtwork: true,
  },
  monolith: {
    name: 'Monolith',
    description: 'The stronger its target, the more damage the Monolith deals.',
    size: 3,
    width: 160,
    hp: 4747,
    cost: 200000,
    resource: 'dark',
    category: 'Defenses',
    maxLevel: 5,
    build: 604800,
    range: 11,
    rate: 1.5,
    targets: 'both',
    singleArtwork: true,
  },
  spelltower: {
    name: 'Spell Tower',
    description: 'Casts Rage, Poison or Invisibility to help nearby defenses and hinder attackers.',
    size: 2,
    width: 120,
    hp: 2500,
    cost: 9000000,
    resource: 'gold',
    category: 'Defenses',
    maxLevel: 4,
    build: 604800,
    range: 9,
    targets: 'both',
    singleArtwork: true,
  },
  tornadotrap: {
    name: 'Tornado Trap',
    description: 'Releases a vortex that draws attacking troops in and hinders their charge.',
    size: 1,
    width: 52,
    hp: 1,
    cost: 1000000,
    resource: 'gold',
    category: 'Traps',
    maxLevel: 3,
    build: 0,
    singleArtwork: true,
    trap: { trigger: 3, radius: 3, delay: 0, damage: 0, targets: 'ground' },
  },
  inferno: {
    name: 'Inferno Tower',
    description: 'Locks onto one target with increasing heat, or attacks several targets at once.',
    size: 2,
    width: 180,
    hp: infernoStats(1).hp,
    cost: infernoStats(1).cost,
    resource: 'gold',
    category: 'Defenses',
    maxLevel: 12,
    build: infernoStats(1).seconds,
    damage: infernoStats(1).weapon.dps[0] * 0.128,
    range: 9,
    rate: 0.128,
    targets: 'both',
    singleArtwork: true,
  },
  clancastle: {
    name: 'Clan Castle',
    description: 'Houses defending reinforcements.',
    size: 3,
    width: CASTLE_ART.width,
    hp: CASTLE_LEVELS[0].hp,
    cost: CASTLE_LEVELS[0].cost,
    resource: 'elixir',
    category: 'Army',
    maxLevel: CASTLE_LEVELS.length,
    // Enemy support first. Home repair and donations require their own complete flow.
    build: 0,
    singleArtwork: true,
  },
  xbow: {
    name: 'X-Bow',
    description:
      'Fires a rapid stream of bolts. Choose long-range ground targeting or a shorter range that covers ground and air.',
    size: 3,
    width: 240,
    hp: XBOW_LEVELS[0].hp,
    cost: XBOW_LEVELS[0].cost,
    resource: 'gold',
    category: 'Defenses',
    maxLevel: XBOW_LEVELS.length,
    build: XBOW_LEVELS[0].seconds,
    damage: xbowDamage(1),
    range: XBOW.groundRange,
    rate: XBOW.interval,
    targets: 'ground',
    singleArtwork: true,
  },
  blacksmith: {
    name: 'Blacksmith',
    description: 'Upgrade hero equipment with ore and choose two abilities for your King.',
    size: 3,
    width: 162,
    hp: 700,
    cost: 600000,
    resource: 'elixir',
    category: 'Army',
    maxLevel: 1,
    build: 43200,
    singleArtwork: true,
  },
  skeletontrap: {
    name: 'Skeleton Trap',
    description:
      'Releases defending Skeletons to distract attackers. Switch between ground and air mode before battle.',
    size: 1,
    width: 54,
    hp: 1,
    cost: 6000,
    resource: 'gold',
    category: 'Traps',
    maxLevel: SKELETON_TRAP_LEVELS,
    build: 0,
    singleArtwork: true,
    trap: { trigger: 5, radius: 0, delay: 0.6, damage: 0, targets: 'ground', minHousing: 1 },
  },
  herohall: {
    name: 'Hero Hall',
    description:
      'Home of the Barbarian King. Unlock your first hero here, then upgrade him from Town Hall 7.',
    size: 4,
    width: 187,
    hp: 1500,
    cost: SOURCE_BUILD.herohall.cost,
    resource: 'elixir',
    category: 'Army',
    // Each hall tier raises the King's ceiling: 10 at hall 1, 20 at hall 2, 30 at hall 3.
    maxLevel: SOURCE_ROWS.herohall,
    build: SOURCE_BUILD.herohall.seconds,
    singleArtwork: true,
  },
  darkdrill: {
    name: 'Dark Elixir Drill',
    description:
      'Extracts dark elixir to upgrade your heroes. Collect regularly to keep the drill working.',
    size: 3,
    width: 110,
    hp: darkDrillStats(1).hp,
    cost: darkDrillStats(1).cost,
    resource: 'elixir',
    category: 'Resources',
    // Source levels 4-6 arrive together at Town Hall 9; level 7 belongs to Town Hall 10.
    maxLevel: MAX_DARK_DRILL_LEVEL,
    build: darkDrillStats(1).seconds,
    singleArtwork: true,
  },
  darkstorage: {
    name: 'Dark Elixir Storage',
    description:
      'Protects Dark Elixir for hero upgrades. Upgrade to increase its capacity and durability.',
    size: 3,
    width: 240,
    hp: DARK_STORAGE_LEVELS[0].hp,
    cost: DARK_STORAGE_LEVELS[0].cost,
    resource: 'elixir',
    category: 'Resources',
    maxLevel: DARK_STORAGE_LEVELS.length,
    build: DARK_STORAGE_LEVELS[0].seconds,
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
    build: 300,
  },
  goldmine: {
    name: 'Gold Mine',
    description: 'Your miners turn the riches of the mountain into gold. Collect regularly.',
    size: 3,
    width: 122,
    hp: 650,
    cost: SOURCE_BUILD.goldmine.cost,
    resource: 'elixir',
    category: 'Resources',
    // Levels 13–14 appear only in late native campaign villages.
    maxLevel: SOURCE_ROWS.goldmine,
    build: SOURCE_BUILD.goldmine.seconds,
  },
  collector: {
    name: 'Elixir Collector',
    description: 'Draws magical elixir from deep underground for upgrades and research.',
    size: 3,
    width: 115,
    hp: 650,
    cost: SOURCE_BUILD.collector.cost,
    resource: 'gold',
    category: 'Resources',
    // Levels 13–14 appear only in late native campaign villages.
    maxLevel: SOURCE_ROWS.collector,
    build: SOURCE_BUILD.collector.seconds,
  },
  goldstorage: {
    name: 'Gold Storage',
    description: 'A well-guarded treasury. Each level expands your gold capacity.',
    size: 3,
    width: 115,
    hp: 1200,
    cost: SOURCE_BUILD.goldstorage.cost,
    resource: 'elixir',
    category: 'Resources',
    // Levels 12–16 appear only in late native campaign villages.
    maxLevel: SOURCE_ROWS.goldstorage,
    build: SOURCE_BUILD.goldstorage.seconds,
  },
  elixirstorage: {
    name: 'Elixir Storage',
    description: 'Keep your elixir safe in this reinforced magical reservoir.',
    size: 3,
    width: 114,
    hp: 1200,
    cost: SOURCE_BUILD.elixirstorage.cost,
    resource: 'gold',
    category: 'Resources',
    // Levels 12–16 appear only in late native campaign villages.
    maxLevel: SOURCE_ROWS.elixirstorage,
    build: SOURCE_BUILD.elixirstorage.seconds,
  },
  barracks: {
    name: 'Barracks',
    description: 'Train your troops here. Prepare troops instantly, ready for your next attack.',
    size: 3,
    width: 134,
    hp: FACILITY_LEVELS.barracks[0].hp,
    cost: FACILITY_LEVELS.barracks[0].cost,
    resource: 'elixir',
    category: 'Army',
    maxLevel: FACILITY_LEVELS.barracks.length,
    build: FACILITY_LEVELS.barracks[0].seconds,
  },
  cannon: {
    name: 'Cannon',
    description: 'A dependable defense with a powerful punch. Ground troops only.',
    size: 3,
    width: 94,
    hp: DEFENSE_PROGRESSION.cannon[0].hp,
    cost: DEFENSE_PROGRESSION.cannon[0].cost,
    resource: 'gold',
    category: 'Defenses',
    maxLevel: DEFENSE_PROGRESSION.cannon.length,
    build: DEFENSE_PROGRESSION.cannon[0].seconds,
    damage: 5.6,
    ...DEFENSE_WEAPONS.cannon,
    targets: 'ground',
  },
  archertower: {
    name: 'Archer Tower',
    description: 'A high vantage point and a long reach. Fires at ground and air.',
    size: 3,
    width: 90,
    hp: DEFENSE_PROGRESSION.archertower[0].hp,
    cost: DEFENSE_PROGRESSION.archertower[0].cost,
    resource: 'gold',
    category: 'Defenses',
    maxLevel: MAX_ARCHER_TOWER_LEVEL,
    build: DEFENSE_PROGRESSION.archertower[0].seconds,
    damage: 5.5,
    ...DEFENSE_WEAPONS.archertower,
    targets: 'both',
  },
  camp: {
    name: 'Army Camp',
    description:
      'Houses your prepared troops. Upgrade to increase capacity; camps keep working during upgrades.',
    size: 4,
    width: campArt(1).width,
    hp: CAMP_LEVELS[0].hp,
    cost: CAMP_LEVELS[0].cost,
    resource: 'elixir',
    category: 'Army',
    maxLevel: CAMP_LEVELS.length,
    build: CAMP_LEVELS[0].seconds,
  },
  builder: {
    name: 'Builder’s Hut',
    description: 'A home for your tireless builders. Adds one simultaneous construction slot.',
    size: 2,
    width: 92,
    hp: 500,
    // Huts are sold for gems, dearer each time: buildPrice quotes the next one. This price
    // is never charged, and `resource` names the gold the hut's own upgrades are bought with.
    cost: 0,
    resource: 'gold',
    category: 'Army',
    maxLevel: SOURCE_ROWS.builder,
    build: 30,
  },
  mortar: {
    name: 'Mortar',
    description:
      'Lobs shells at groups of ground attackers. Rush inside its 4-tile blind spot to avoid its fire.',
    size: 3,
    width: 104,
    hp: DEFENSE_PROGRESSION.mortar[0].hp,
    cost: DEFENSE_PROGRESSION.mortar[0].cost,
    resource: 'gold',
    category: 'Defenses',
    maxLevel: DEFENSE_PROGRESSION.mortar.length,
    build: DEFENSE_PROGRESSION.mortar[0].seconds,
    damage: 20,
    ...DEFENSE_WEAPONS.mortar,
    targets: 'ground',
  },
  airdefense: {
    name: 'Air Defense',
    description: 'An iron rocket battery. Devastating against balloons — and blind to the ground.',
    size: 3,
    width: 104,
    hp: DEFENSE_PROGRESSION.airdefense[0].hp,
    cost: DEFENSE_PROGRESSION.airdefense[0].cost,
    resource: 'gold',
    category: 'Defenses',
    maxLevel: DEFENSE_PROGRESSION.airdefense.length,
    build: DEFENSE_PROGRESSION.airdefense[0].seconds,
    damage: 80,
    ...DEFENSE_WEAPONS.airdefense,
    targets: 'air',
  },
  airsweeper: {
    name: 'Air Sweeper',
    description:
      'Blows flying enemies backward without dealing damage. Rotate its nozzle to cover an approach; troops behind it and inside its blind spot are safe.',
    size: 2,
    width: 94,
    hp: SWEEPER_LEVELS[0].hp,
    cost: SWEEPER_LEVELS[0].cost,
    resource: 'gold',
    category: 'Defenses',
    maxLevel: SWEEPER_LEVELS.length,
    build: SWEEPER_LEVELS[0].seconds,
    range: SWEEPER.range,
    minRange: SWEEPER.minRange,
    rate: SWEEPER.rate,
    targets: 'air',
    singleArtwork: true,
  },
  bombtower: {
    name: 'Bomb Tower',
    description:
      'Throws bombs at nearby ground troops. When destroyed, a larger bomb explodes after one second, damaging enemies still nearby.',
    size: 3,
    width: BOMB_TOWER_ART.width,
    hp: DEFENSE_PROGRESSION.bombtower[0].hp,
    cost: DEFENSE_PROGRESSION.bombtower[0].cost,
    resource: 'gold',
    category: 'Defenses',
    maxLevel: DEFENSE_PROGRESSION.bombtower.length,
    build: DEFENSE_PROGRESSION.bombtower[0].seconds,
    damage: 26.4,
    ...DEFENSE_WEAPONS.bombtower,
    targets: 'ground',
    singleArtwork: true,
  },
  tesla: {
    name: 'Hidden Tesla',
    description:
      'Stays hidden until an enemy comes within 6 tiles or destruction reaches 51%. Fires rapid electrical bolts at ground and air troops.',
    size: 2,
    width: TESLA_ART.width,
    hp: DEFENSE_PROGRESSION.tesla[0].hp,
    cost: DEFENSE_PROGRESSION.tesla[0].cost,
    resource: 'gold',
    category: 'Defenses',
    maxLevel: TESLA_ART_LEVELS.length,
    build: DEFENSE_PROGRESSION.tesla[0].seconds,
    damage: 20.4,
    ...DEFENSE_WEAPONS.tesla,
    targets: 'both',
    singleArtwork: true,
  },
  seekingairmine: {
    name: 'Seeking Air Mine',
    description:
      'A hidden homing mine that strikes one air troop for heavy damage. Requires at least 5 housing spaces to trigger, including Balloons, Healers and Dragons.',
    size: 1,
    width: 44,
    hp: 1,
    cost: SEEKING_MINE_LEVELS[0].cost,
    resource: 'gold',
    category: 'Traps',
    maxLevel: SEEKING_MINE_LEVELS.length,
    build: SEEKING_MINE_LEVELS[0].seconds,
    singleArtwork: true,
    trap: {
      trigger: SEEKING_MINE.trigger,
      radius: SEEKING_MINE.radius,
      delay: SEEKING_MINE.delay,
      damage: SEEKING_MINE_LEVELS[0].damage,
      targets: 'air',
      minHousing: SEEKING_MINE.minHousing,
      homingSpeed: SEEKING_MINE.speed,
    },
  },
  laboratory: {
    name: 'Laboratory',
    description: 'Research permanent troop upgrades. Higher levels unlock stronger troops.',
    size: 3,
    width: 122,
    hp: FACILITY_LEVELS.laboratory[0].hp,
    cost: FACILITY_LEVELS.laboratory[0].cost,
    resource: 'elixir',
    category: 'Army',
    maxLevel: FACILITY_LEVELS.laboratory.length,
    build: FACILITY_LEVELS.laboratory[0].seconds,
  },
  spellfactory: {
    name: 'Spell Factory',
    description:
      'Prepares spells instantly. Upgrades unlock new spells and increase spell housing.',
    size: 3,
    width: 122,
    hp: FACILITY_LEVELS.spellfactory[0].hp,
    cost: FACILITY_LEVELS.spellfactory[0].cost,
    resource: 'elixir',
    category: 'Army',
    maxLevel: FACILITY_LEVELS.spellfactory.length,
    build: FACILITY_LEVELS.spellfactory[0].seconds,
  },
  wizardtower: {
    name: 'Wizard Tower',
    description:
      'A Wizard atop a stone tower. Hits groups of ground or air troops, one layer at a time.',
    size: 3,
    width: WIZARD_TOWER_ART.width,
    hp: DEFENSE_PROGRESSION.wizardtower[0].hp,
    cost: DEFENSE_PROGRESSION.wizardtower[0].cost,
    resource: 'gold',
    category: 'Defenses',
    maxLevel: DEFENSE_PROGRESSION.wizardtower.length,
    build: DEFENSE_PROGRESSION.wizardtower[0].seconds,
    damage: 14.3,
    ...DEFENSE_WEAPONS.wizardtower,
    targets: 'both',
    singleArtwork: true,
  },
  bomb: {
    name: 'Bomb',
    description:
      'Hidden until a ground troop approaches. A short fuse gives fast troops a chance to escape the blast.',
    size: 1,
    width: 39,
    hp: 1,
    cost: TRAP_LEVELS.bomb[0].cost,
    resource: 'gold',
    category: 'Traps',
    maxLevel: TRAP_LEVELS.bomb.length,
    build: 0,
    singleArtwork: true,
    trap: {
      trigger: 1.5,
      radius: 3,
      delay: 1.5,
      damage: TRAP_LEVELS.bomb[0].damage,
      targets: 'ground',
    },
  },
  giantbomb: {
    name: 'Giant Bomb',
    description:
      'A powerful hidden blast for groups of ground troops. Place beside a gap in your walls.',
    size: 2,
    width: 70,
    hp: 1,
    cost: TRAP_LEVELS.giantbomb[0].cost,
    resource: 'gold',
    category: 'Traps',
    maxLevel: TRAP_LEVELS.giantbomb.length,
    build: 0,
    singleArtwork: true,
    trap: {
      trigger: 2,
      radius: 3,
      delay: 1.5,
      damage: TRAP_LEVELS.giantbomb[0].damage,
      targets: 'ground',
    },
  },
  airbomb: {
    name: 'Air Bomb',
    description:
      'A concealed balloon bomb that tracks an air troop and bursts among nearby flyers. Ground troops never trigger it.',
    size: 1,
    width: 44,
    hp: 1,
    cost: TRAP_LEVELS.airbomb[0].cost,
    resource: 'gold',
    category: 'Traps',
    maxLevel: TRAP_LEVELS.airbomb.length,
    build: 0,
    singleArtwork: true,
    trap: {
      trigger: 4,
      radius: 3,
      delay: 0.9,
      damage: TRAP_LEVELS.airbomb[0].damage,
      targets: 'air',
    },
  },
  springtrap: {
    name: 'Spring Trap',
    description:
      'Springs the largest ground troop in range out of battle. Oversized troops are tossed upward and stunned; upgraded springs also damage them.',
    size: 1,
    width: 44,
    hp: 1,
    cost: TRAP_LEVELS.springtrap[0].cost,
    resource: 'gold',
    category: 'Traps',
    maxLevel: TRAP_LEVELS.springtrap.length,
    build: 0,
    singleArtwork: true,
    trap: {
      trigger: 1,
      radius: 1,
      delay: 0,
      damage: TRAP_LEVELS.springtrap[0].damage,
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
    maxLevel: WALL_LEVELS.length,
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
  /** Radius of attack splash; death blasts are specified separately. */
  splash?: number;
  cost: number;
  space: number;
  time: number;
  width: number;
  /** Seconds for the first laboratory research. Each upgrade uses its explicit level record. */
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
  /** Friendly ground support; never attacks buildings. */
  healer?: boolean;
  heal?: number;
}
export const TROOPS: Record<TroopKind, TroopDef> = {
  swordsman: {
    name: 'Barbarian',
    role: 'MELEE',
    description: 'Fearless frontline fighters. Best deployed in a group.',
    hp: troopProgression('swordsman', 1)!.hp,
    damage: troopProgression('swordsman', 1)!.dps,
    speed: 2.2,
    range: 0.4,
    rate: 1,
    cost: 0,
    space: 1,
    time: 0,
    width: 29,
    research: troopProgression('swordsman', 2)!.seconds,
  },
  archer: {
    name: 'Archer',
    role: 'RANGED',
    description: 'Picks off buildings from behind your frontline.',
    hp: troopProgression('archer', 1)!.hp,
    damage: troopProgression('archer', 1)!.dps,
    speed: 3,
    range: 3.5,
    rate: 1,
    cost: 0,
    space: 1,
    time: 0,
    width: 26,
    research: troopProgression('archer', 2)!.seconds,
  },
  giant: {
    name: 'Giant',
    role: 'TANK',
    description: 'Soaks up damage and targets defensive buildings first.',
    hp: troopProgression('giant', 1)!.hp,
    damage: troopProgression('giant', 1)!.dps * 2,
    speed: 1.5,
    range: 1,
    rate: 2,
    cost: 0,
    space: 5,
    time: 0,
    width: 45,
    research: troopProgression('giant', 2)!.seconds,
    prefersDefenses: true,
  },
  wizard: {
    name: 'Wizard',
    role: 'SPLASH',
    description: 'Hurls concentrated fireballs with a small splash radius.',
    hp: troopProgression('wizard', 1)!.hp,
    damage: troopProgression('wizard', 1)!.dps * 1.5,
    speed: 2,
    range: 3,
    rate: 1.5,
    splash: 0.3,
    cost: 0,
    space: 4,
    time: 0,
    width: 30,
    research: troopProgression('wizard', 2)!.seconds,
  },
  balloon: {
    name: 'Balloon',
    role: 'AIR',
    description:
      'Drifts over walls and drops bombs that blast nearby buildings. Only air-targeting defenses can reach it.',
    hp: troopProgression('balloon', 1)!.hp,
    damage: troopProgression('balloon', 1)!.dps * 3,
    speed: 1.25,
    range: 0.5,
    rate: 3,
    splash: 1.2,
    cost: 0,
    space: 5,
    time: 0,
    width: 50,
    research: troopProgression('balloon', 2)!.seconds,
    flying: true,
    prefersDefenses: true,
    deathDamage: troopProgression('balloon', 1)!.deathDamage,
    deathRadius: 1.2,
  },
  goblin: {
    name: 'Goblin',
    role: 'LOOT',
    description:
      'Sprints for mines, collectors, drills, storages and the Town Hall. Deals double damage to resources.',
    hp: troopProgression('goblin', 1)!.hp,
    damage: troopProgression('goblin', 1)!.dps,
    speed: 4,
    range: 0.4,
    rate: 1,
    cost: 0,
    space: 1,
    time: 0,
    width: 28,
    research: troopProgression('goblin', 2)!.seconds,
    prefersResources: true,
  },
  wallbreaker: {
    name: 'Wall Breaker',
    role: 'BREACH',
    description:
      'Runs at walls protecting buildings and sacrifices itself in a blast. Its attack and death blast both deal 40× damage to walls.',
    hp: troopProgression('wallbreaker', 1)!.hp,
    damage: troopProgression('wallbreaker', 1)!.dps,
    speed: 3,
    range: 1,
    rate: 1,
    cost: 0,
    space: 2,
    time: 0,
    width: 28,
    research: troopProgression('wallbreaker', 2)!.seconds,
    wallBreaker: true,
    deathDamage: troopProgression('wallbreaker', 1)!.deathDamage,
    deathRadius: 2,
  },
  healer: {
    name: 'Healer',
    role: 'SUPPORT',
    description:
      'Flies behind ground troops and restores health to their group. Protect her from air defenses.',
    hp: troopProgression('healer', 1)!.hp,
    damage: 0,
    heal: troopProgression('healer', 1)!.heal! * 0.7,
    speed: 2,
    range: 4.5,
    rate: 0.7,
    splash: 1.5,
    cost: 0,
    space: 14,
    time: 0,
    width: 42,
    research: troopProgression('healer', 2)!.seconds,
    flying: true,
    healer: true,
  },
  dragon: {
    name: 'Dragon',
    role: 'AIR SPLASH',
    description:
      'Flies over walls and breathes fire onto nearby buildings. A powerful attacker that needs protection from air defenses.',
    hp: troopProgression('dragon', 1)!.hp,
    damage: troopProgression('dragon', 1)!.dps * 1.25,
    speed: 2,
    range: 2.5,
    rate: 1.25,
    splash: 0.3,
    cost: 0,
    space: 20,
    time: 0,
    width: 64,
    research: troopProgression('dragon', 2)!.seconds,
    flying: true,
  },
  pekka: {
    name: 'P.E.K.K.A',
    role: 'HEAVY MELEE',
    description:
      'A heavily armored warrior with devastating sword strikes. Clear a path through walls to keep her moving.',
    hp: troopProgression('pekka', 1)!.hp,
    damage: troopProgression('pekka', 1)!.dps * 1.8,
    speed: 2,
    range: 0.8,
    rate: 1.8,
    cost: 0,
    space: 25,
    time: 0,
    width: 44,
    research: troopProgression('pekka', 2)!.seconds,
  },
};
/** Stable keyboard assignments shared by the cards and keyboard handler. */
export const TROOP_HOTKEYS = ['1', '2', '3', '4', '5', '6', '7', 'q', 'w', 'e'];
export const SPELL_HOTKEYS = ['8', '9', '0'];
export const isResourceBuilding = (kind: BuildingKind) =>
  [
    'clancastle',
    'townhall',
    'goldmine',
    'collector',
    'goldstorage',
    'elixirstorage',
    'darkdrill',
    'darkstorage',
  ].includes(kind);
/** Which resource a building accumulates over time, if any. */
export const producedResource = (kind: BuildingKind): Resource | null =>
  kind === 'goldmine'
    ? 'gold'
    : kind === 'collector'
      ? 'elixir'
      : kind === 'darkdrill'
        ? 'dark'
        : null;
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
    radius: 5,
    duration: RAGE_PULSES * SPELL_PULSE_INTERVAL,
    effect: '+130% damage · +2.5 tiles/s',
  },
  heal: {
    name: 'Healing Spell',
    role: 'SUPPORT',
    description: 'A ring of restoring light that mends your troops where they stand.',
    cost: 0,
    space: 2,
    time: 0,
    radius: 5,
    duration: HEAL_PULSES * SPELL_PULSE_INTERVAL,
    effect: '615 total healing',
  },
  lightning: {
    name: 'Lightning Spell',
    role: 'DIRECT',
    description:
      'A focused bolt damages and briefly stuns enemies. Town Halls and resource storages are immune.',
    cost: 0,
    space: 1,
    time: 0,
    radius: 2,
    duration: 0,
    effect: '150 damage · 0.1s stun',
  },
};
export function spellStatsAt(kind: SpellKind, level = 1) {
  const stats = spellProgression(kind, level) ?? spellProgression(kind, 1);
  return {
    ...SPELLS[kind],
    ...stats,
    effect:
      kind === 'lightning'
        ? `${stats.damage} damage · 0.1s stun`
        : kind === 'heal'
          ? `${stats.heal * HEAL_PULSES} total healing`
          : `+${stats.damageBoost}% damage · +${stats.speedBoost / 8} tiles/s`,
  };
}
export const TROOP_KEYS = Object.keys(TROOPS) as TroopKind[];
export const LATE_TROOP_KEYS = ['healer', 'dragon', 'pekka'] as const;
export const LEGACY_TROOP_KEYS = TROOP_KEYS.filter(
  (k) => !LATE_TROOP_KEYS.includes(k as (typeof LATE_TROOP_KEYS)[number]),
);
export const SPELL_KEYS = Object.keys(SPELLS) as SpellKind[];
export const isSpellKind = (kind: unknown): kind is SpellKind =>
  typeof kind === 'string' && Object.hasOwn(SPELLS, kind);
export const BUILDING_KEYS = Object.keys(BUILDINGS) as BuildingKind[];
export const isDefense = (kind: BuildingKind) =>
  !!BUILDINGS[kind].damage ||
  kind === 'airsweeper' ||
  kind === 'eagleartillery' ||
  kind === 'scattershot' ||
  kind === 'monolith' ||
  kind === 'spelltower';
export const isTrap = (kind: BuildingKind) => !!BUILDINGS[kind].trap;
/** First tier that permits one. A withheld building still shows its original requirement. */
export const unlockTownHall = (kind: BuildingKind) =>
  kind === 'clancastle'
    ? CASTLE_LEVELS[0].townhall
    : BUILDING_COUNTS[kind].findIndex((n) => n > 0) + 1;
export const trapDamage = (kind: BuildingKind, level: number) =>
  trapProgression(kind, level)?.damage ?? 0;
export const springCapacity = (level: number) =>
  TRAP_LEVELS.springtrap[Math.min(TRAP_LEVELS.springtrap.length, Math.max(1, level)) - 1]
    .capacity ?? 0;
export const trapStats = (kind: BuildingKind, level: number) => {
  const base = BUILDINGS[kind].trap;
  if (!base) return undefined;
  const stats = trapProgression(kind, level);
  return {
    ...base,
    damage: trapDamage(kind, level),
    radius: stats && 'radius' in stats && stats.radius !== undefined ? stats.radius : base.radius,
    springCapacity: base.springCapacity ? springCapacity(level) : undefined,
  };
};
/** Level at which a structure switches to its distinct late-game artwork. */
export const TIER3_LEVEL = 5;
/** Shared by placed buildings and placement previews, including legacy art fallbacks. */
export const buildingTexture = (
  kind: BuildingKind,
  level = 1,
  direction = 0,
  xbowMode: XbowMode = 'ground',
  infernoMode: InfernoMode = 'single',
  spellTowerWeapon?: string,
) => {
  if (hasLateArt(kind)) return lateTexture(kind, level, spellTowerWeapon);
  if (kind === 'inferno') return infernoTexture(level, infernoMode);
  if (kind === 'clancastle') return castleTexture(level);
  if (kind === 'darkstorage') return darkStorageTexture(level);
  if (kind === 'xbow') return xbowTexture(level, xbowMode);
  if (kind === 'skeletontrap') return skeletonTrapTexture('ground', level);
  if (kind === 'bombtower') return bombTowerTexture(level);
  if (kind === 'wizardtower') return wizardTowerTexture(level);
  if (kind === 'tesla') return teslaTexture(level);
  if (kind === 'airsweeper') return sweeperTexture(level, direction);
  if (kind === 'seekingairmine') return seekingMineTexture(level);
  if (kind === 'wall') return wallTexture(level);
  if (kind === 'cannon') return cannonTexture(level);
  if (kind === 'mortar') return mortarTexture(level);
  if (kind === 'camp') return campTexture(level);
  return level >= TIER3_LEVEL && !BUILDINGS[kind].singleArtwork ? `${kind}-tier3` : kind;
};
const ENVIRONMENT = new Set(['wall', 'trees', 'rocks', 'flag']);
const ORIGINAL_ART = new Set(['airdefense', 'spellfactory', 'balloon']);
// Keep the persisted swordsman key in armies, research, presets and replay actions.
const artName = (kind: string) =>
  kind === 'swordsman' ? 'barbarian-v1' : `${kind}${ORIGINAL_ART.has(kind) ? '-v2' : ''}`;
export const walkAsset = (kind: string) => `/assets/characters/walk/${artName(kind)}.webp`;
export const asset = (
  kind: string,
  level = 1,
  skeletonMode: SkeletonMode = 'ground',
  xbowMode: XbowMode = 'ground',
  infernoMode: InfernoMode = 'single',
  spellTowerWeapon?: string,
) => {
  if (hasLateArt(kind)) return lateAsset(kind, level, spellTowerWeapon);
  if (kind === 'darkdrill') {
    const portrait = drillPortraits.portraits.find((row) => row.level === level);
    if (!portrait) throw new Error(`Unsupported Dark Elixir Drill portrait: ${level}`);
    return '/' + portrait.path;
  }
  if (kind === 'inferno') return infernoAsset(level, infernoMode);
  if (kind === 'clancastle') return castleAsset(level);
  if (kind === 'darkstorage') return darkStorageAsset(level);
  if (kind === 'xbow') return xbowAsset(level, xbowMode);
  if (kind === 'skeletontrap') return skeletonTrapAsset(skeletonMode, level);
  if (kind === 'bombtower') return bombTowerAsset(level);
  if (kind === 'wizardtower') return wizardTowerAsset(level);
  if (kind === 'tesla') return teslaAsset(level);
  if (kind === 'airsweeper') return sweeperAsset(level);
  if (kind === 'seekingairmine') return seekingMineAsset();
  if (kind === 'wall') return wallAsset(level);
  if (kind === 'cannon') return cannonAsset(level);
  if (kind === 'mortar') return mortarAsset(level);
  if (kind === 'camp') return campAsset(level);
  if (kind === 'king') return '/assets/characters/king-v1/portrait.webp';
  if (LATE_TROOP_KEYS.includes(kind as (typeof LATE_TROOP_KEYS)[number]))
    return `/assets/characters/${kind}-v1.webp`;
  if (kind in SPELLS) return `/assets/spells/${kind}-v2.webp`;
  if (kind in BUILDINGS && buildingTexture(kind as BuildingKind, level).endsWith('-tier3'))
    return `/assets/buildings/tier3/${artName(kind)}.webp`;
  const folder =
    kind in TROOPS ? 'characters' : ENVIRONMENT.has(kind) ? 'environment' : 'buildings';
  return `/assets/${folder}/${artName(kind)}.webp`;
};
/**
 * What one more of a building costs, given how many the village already has. Every building
 * but the Builder's Hut charges a flat price; the original sells huts for gems, dearer each
 * time, and hands the second one over free.
 */
export const buildPrice = (
  kind: BuildingKind,
  owned: number,
): { resource: Payment; cost: number } =>
  kind === 'builder'
    ? { resource: 'gems', cost: WORKER_GEMS[Math.min(WORKER_GEMS.length, Math.max(1, owned)) - 1] }
    : { resource: BUILDINGS[kind].resource, cost: BUILDINGS[kind].cost };
/** Explicit catalog ceilings; old villages retain existing buildings above them. */
export const maxLevelFor = (kind: BuildingKind, townhall: number) =>
  Math.min(
    BUILDINGS[kind].maxLevel,
    BUILDING_LEVELS[kind][Math.min(MAX_TOWNHALL, Math.max(1, townhall)) - 1],
  );
export const maxCountFor = (kind: BuildingKind, townhall: number) =>
  BUILDING_COUNTS[kind][Math.min(MAX_TOWNHALL, Math.max(1, townhall)) - 1];
/** Seconds to take a building from `level` to `level + 1`. */
export const upgradeSeconds = (kind: BuildingKind, level: number) =>
  (kind === 'darkdrill' ? darkDrillStats(level + 1).seconds : undefined) ??
  (kind === 'clancastle' ? castleStats(level + 1)?.seconds : undefined) ??
  (kind === 'darkstorage' ? darkStorageStats(level + 1)?.seconds : undefined) ??
  (kind === 'airsweeper' ? SWEEPER_LEVELS[level]?.seconds : undefined) ??
  facilityProgression(kind, level + 1)?.seconds ??
  campProgression(kind, level + 1)?.seconds ??
  trapProgression(kind, level + 1)?.seconds ??
  defenseProgression(kind, level + 1)?.seconds ??
  // Every remaining home building takes its original destination duration.
  sourceLevel(kind, level + 1)?.seconds ??
  Math.round(BUILDINGS[kind].build * Math.pow(2.1, level - 1));
/** One store's original allowance. Gold and Elixir Storage share a table level for level. */
export const storageCapacity = (level: number) =>
  sourceLevel('goldstorage', Math.max(1, level))?.storedGold ??
  sourceLevel('goldstorage', SOURCE_ROWS.goldstorage)!.storedGold!;
/** The Town Hall's own store, which the original counts toward every resource cap. */
export const townHallCapacity = (level: number, resource: Resource) => {
  const row = sourceLevel('townhall', Math.min(MAX_TOWNHALL, Math.max(1, level)));
  if (!row) return 0;
  return (
    (resource === 'gold'
      ? row.storedGold
      : resource === 'elixir'
        ? row.storedElixir
        : row.storedDark) ?? 0
  );
};
/** Hitpoints shared by construction, upgrades, restored villages and the Info panel. */
export const buildingHp = (kind: BuildingKind, level: number) =>
  (kind === 'darkdrill' ? darkDrillStats(level).hp : undefined) ??
  (kind === 'inferno' ? infernoStats(level).hp : undefined) ??
  (kind === 'clancastle' ? castleStats(level)?.hp : undefined) ??
  (kind === 'seekingairmine' ? 1 : undefined) ??
  (kind === 'darkstorage' ? darkStorageStats(level)?.hp : undefined) ??
  (kind === 'airsweeper' ? sweeperStats(level).hp : undefined) ??
  facilityProgression(kind, level)?.hp ??
  campProgression(kind, level)?.hp ??
  defenseProgression(kind, level)?.hp ??
  (kind === 'wall'
    ? WALL_LEVELS[Math.min(WALL_LEVELS.length, Math.max(1, level)) - 1].hp
    : // Every remaining home building takes its original hitpoints. The local curve it
      // replaces only still covers a level no original table reaches.
      (sourceLevel(kind, level)?.hp ?? BUILDINGS[kind].hp * (1 + (level - 1) * 0.25)));
/** Cost of the destination level; audited buildings use undiscounted Home Village tables. */
export const upgradeCost = (kind: BuildingKind, level: number) =>
  (kind === 'darkdrill' ? darkDrillStats(level + 1).cost : undefined) ??
  (kind === 'clancastle' ? castleStats(level + 1)?.cost : undefined) ??
  (kind === 'darkstorage' ? darkStorageStats(level + 1)?.cost : undefined) ??
  (kind === 'airsweeper' ? SWEEPER_LEVELS[level]?.cost : undefined) ??
  facilityProgression(kind, level + 1)?.cost ??
  campProgression(kind, level + 1)?.cost ??
  trapProgression(kind, level + 1)?.cost ??
  defenseProgression(kind, level + 1)?.cost ??
  (kind === 'wall'
    ? (WALL_LEVELS[level]?.cost ?? 0)
    : // Every remaining home building takes its original destination price. The prototype
      // curve it replaces outgrew storage capacity and stalled the ladder around Town Hall 13.
      (sourceLevel(kind, level + 1)?.cost ??
      Math.floor(BUILDINGS[kind].cost * Math.pow(1.85, level))));
/** Shared native current/preview stats for every supported troop level. */
export const troopStatsAt = (kind: TroopKind, level: number) => {
  const safeLevel = Math.min(maxTroopLevel(kind), Math.max(1, Math.floor(level) || 1));
  const d = TROOPS[kind],
    audited = troopProgression(kind, safeLevel)!;
  return {
    ...d,
    hp: audited.hp,
    damage: audited.dps * d.rate,
    heal: audited.heal === undefined ? undefined : audited.heal * d.rate,
    deathDamage: audited.deathDamage,
  };
};
/** Requirements/cost/duration to move from the current level to the next. */
export const researchLaboratory = (kind: TroopKind, level: number) =>
  troopProgression(kind, level + 1)?.laboratory ?? Infinity;
export const researchLevelForLab = (kind: TroopKind, laboratory: number) => {
  let level = 1;
  while (level < maxTroopLevel(kind) && researchLaboratory(kind, level) <= laboratory) level++;
  return level;
};
export const researchSeconds = (kind: TroopKind, level: number) =>
  troopProgression(kind, level + 1)?.seconds ?? 0;
/** Audited normal-mode damage per hit; other defenses retain their prototype scaling. */
export const defenseDamage = (kind: BuildingKind, level: number) => {
  if (kind === 'inferno') return infernoStats(level).weapon.dps[0] * 0.128;
  if (kind === 'xbow') return xbowDamage(level);
  const audited = defenseProgression(kind, level);
  return audited
    ? Math.round(audited.dps * BUILDINGS[kind].rate! * 10) / 10
    : (BUILDINGS[kind].damage ?? 0) * (1 + (level - 1) * 0.12);
};
export const defenseDps = (kind: BuildingKind, level: number) =>
  defenseProgression(kind, level)?.dps ??
  (BUILDINGS[kind].rate ? defenseDamage(kind, level) / BUILDINGS[kind].rate! : 0);
export const researchCost = (kind: TroopKind, level: number) =>
  troopProgression(kind, level + 1)?.cost ?? 0;
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
