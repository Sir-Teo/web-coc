import { troopFacility } from './army-unlocks';
import nativeProgression from '../../reference/full-client/progression.json';
import { maxSpellLevel } from './spell-progression';
import {
  stepArcherTower,
  recordArcherTowerShot,
  type ArcherTowerWindup,
} from './archer-tower-attack';
import { produceDarkElixir } from './dark-drill-production';
import { findSubtilePath, subtileSolid } from './subtile-path';
import {
  lateActivatedDefense,
  lateBuildingDestroyed,
  lateBuildingHidden,
  lateCampaignPending,
  lateDefenseBoost,
  lateLightningStrike,
  lateLootHitpoints,
  lateUnitHeld,
  lateUnitRooted,
  lateUnitMoveScale,
  lateUnitTimeScale,
  stepLateCampaign,
  type LateBattleState,
  type LatePhase,
  type LateUnitState,
  type SpellTowerWeapon,
} from './late-campaign';
import { validInfernoMode, type InfernoMode } from './inferno-weapon';
import { stepInfernos, type InfernoBattleState } from './inferno-battle';
import { recordCannonShot, recordCannonDestroyed, type CannonAttackState } from './cannon-attack';
import {
  launchMortarShell,
  stepMortarShells,
  recordMortarDestroyed,
  type MortarAttackState,
} from './mortar-attack';
import { distance2D } from './distance';
import { stepGarrisonReleases, type GarrisonState } from './garrison-release';
import { garrisonUnitScales } from './garrison-status';
import { campaignGarrisonSetup } from './garrison-campaign';
import {
  recordWizardTowerShot,
  recordWizardTowerDestroyed,
  type WizardTowerAttackState,
} from './wizard-tower-attack';
import {
  recordBombTowerShot,
  recordBombTowerDestroyed,
  type BombTowerAttackState,
} from './bomb-tower-attack';
import { recordTeslaShot, type TeslaAttackState } from './tesla-attack';
import { darkStorageCapacity } from './dark-storage-stats';
import {
  emptyStarBonus,
  leagueFor,
  STAR_BONUS_COOLDOWN,
  STAR_BONUS_STARS,
  starBonusReward,
  type StarBonus,
} from './leagues';
import { STARTING_GRANT } from './townhall-catalog';
import {
  campaignStage,
  campaignStages,
  validCampaignCatalog,
  type CampaignCatalog,
} from './campaign-catalog';
import {
  freshNativeCampaign,
  nativeBuildings,
  nativeCampaignIssues,
  nativeScenery,
  nativeUnlocked,
  type NativeCampaignProgress,
  type CampaignScenery,
} from './native-campaign';
import {
  NPC_BUILDINGS,
  TUTORIAL_CANNON_DAMAGE,
  validNpcBuilding,
  type NpcBuildingKind,
} from './npc-buildings';
import {
  freshCampaignLoot,
  campaignAmount,
  campaignResourceKeys,
  campaignResources,
  type CampaignLoot,
  type CampaignResources,
} from './campaign-loot';
import { concealedTesla, presentBuilding, targetableBuilding, revealTeslas } from './hidden-tesla';
import {
  defaultEquipment,
  emptyOres,
  oreCapacity,
  equipmentBonuses,
  equipmentQuote,
  validEquipmentKind,
  EQUIPMENT,
  EQUIPMENT_MAX_LEVEL,
  EQUIPMENT_LEVELS,
  equipmentBlacksmith,
  ORE_KEYS,
  ORES,
  type KingEquipment,
  type Ores,
  type EquipmentKind,
} from './equipment';
import { startKingQuake, stepKingQuakes, type KingQuake } from './king-quake';
import { validDirection } from './air-control-stats';
import { validSkeletonMode, SKELETON_COFFIN_SECONDS, type SkeletonMode } from './skeleton-stats';
import { validXbowMode, type XbowMode, type XbowState } from './xbow-stats';
import { stepXbow } from './xbow';
import {
  stepDefenders,
  stepAttackerVsDefenders,
  damageDefenders,
  type Defender,
} from './defenders';
import { primeDeathBomb, stepDeathBombs, bombTowerDeathDamage, type DeathBomb } from './bomb-tower';
import { wizardTowerProjectileTier } from './wizard-tower-stats';
import {
  stepSweepers,
  stepAirPush,
  recordSweeperDestroyed,
  type SweeperHistory,
  type AirGust,
  type SweeperState,
  type AirPush,
} from './air-sweeper';
import { isDefense } from './data';
import { BUILDING_COUNTS } from './tiers';
/** Weapon order for the home Spell Tower selector. */
const SPELL_TOWER_CYCLE = ['rage', 'poison', 'invisibility'] as const;
import { campCapacity } from './camp-stats';
import { spellFactoryCapacity, facilityProgression } from './facility-progression';
import {
  maxSpellLevelFor,
  spellProgression,
  LIGHTNING_STUN,
  freezeSeconds,
  cloneHousing,
  CLONE_LIFETIME,
  recallHousing,
  reviveFraction,
  RAGE_HERO_MULTIPLIER,
  SPELL_SPEED_SCALE,
} from './spell-progression';
import {
  startSpellAura,
  stepSpellAuras,
  untargetable,
  openBreaches,
  type AuraSpell,
} from './spell-effects';
import { prepareHealerTargets, stepHealer } from './healing';
import { MAP_SIZE, BUILD_MIN, BUILD_MAX } from './grid';
import { wallDestinations, wallMoveIssue, type WallMove } from './wall-movement';
import { wallRow, matchingWalls, type WallAxis, type WallResource } from './wall-selection';
import {
  OBSTACLES,
  OBSTACLE_GEMS,
  initialObstacles,
  overlapsObstacle,
  initialObstacleGrowth,
  advanceObstacles,
  type ObstacleGrowth,
  type Obstacle,
} from './obstacles';
import { TROOP_UNLOCK, SPELL_UNLOCK, facilityLevel, spellFactory } from './army-unlocks';
import {
  REPLAY_VERSION,
  compatibleReplayVersion,
  REPLAY_LIMIT,
  MAX_REPLAY_STEPS,
  MAX_REPLAY_ACTIONS,
  MAX_REPLAY_STEPS_PER_UPDATE,
  MAX_REPLAY_UPDATE_MS,
  replayBattle,
  validateReplay,
  type ReplayData,
  type ReplayAction,
  type ReplayPlayback,
} from './replay';
import {
  HERO_ABILITY,
  heroStats,
  heroRecovery,
  heroLevelCap,
  heroUpgradeCost,
  heroUpgradeSeconds,
  type HeroProgress,
  type BattleHero,
} from './heroes';
import {
  launchProjectile,
  stepProjectiles,
  type CombatProjectile,
  type Weapon,
} from './projectiles';
import { campaignBlueprint, CAMPAIGN_LAYOUTS } from './campaign';
import {
  armySpace,
  spellSpace,
  emptyArmy,
  emptySpells,
  defaultSpellLevels,
  expandArmyRoster,
  type ArmyPreset,
} from './army';
import { stepTraps, type TrapState } from './traps';
import { shrinkStepTime, type ShrinkStatus } from './shrink-trap';
import {
  BUILDINGS,
  TROOPS,
  SPELLS,
  TROOP_KEYS,
  SPELL_KEYS,
  RELEASED_SPELL_KEYS,
  CAMPAIGN,
  isSpellKind,
  spellStatsAt,
  maxTroopLevel,
  defenseDamage,
  isResourceBuilding,
  isTrap,
  gemCost,
  maxCountFor,
  maxLevelFor,
  producedResource,
  researchCost,
  researchSeconds,
  researchLaboratory,
  troopStatsAt,
  buildPrice,
  storageCapacity,
  townHallCapacity,
  buildingHp,
  upgradeCost,
  upgradeSeconds,
  type BuildingKind,
  type TroopKind,
  type UnitKind,
  type SpellKind,
  type ResearchKind,
  type Resource,
} from './data';
import {
  initialNativeState,
  nativeBehavior,
  resolveNativeDeath,
  resolveNativeImpact,
  stepNativeBattle,
  stepNativeUnit,
  type NativeUnitState,
  type NativeDeathBlast,
  type NativeChainHop,
  type NativeTroopContext,
  type NativePendingSpawn,
} from './native-troops';
import type { NativeSpellCast } from './native-spells';
import {
  buildingAttackIntervalScale,
  buildingDamageScale,
  buildingImmune,
  hurtUnit,
  unitDamageScale,
  unitFrozen,
  unitHidden,
  unitSpeedBonus,
  unitSpeedScale,
  type BuildingEffects,
} from './native-status';
import { jumpWalls, castNativeSpell, nativeSpellCanStillFight } from './native-spells';
import {
  activeAsDefense,
  heroWakeSpace,
  nativeDefense,
  noteBuildingDamage,
  recordWakeSpace,
  resolveDefenseImpact,
  spellWakeSpace,
  stepNativeDefense,
  stepPiercingShots,
  troopWakeSpace,
  type NativeDefenseContext,
  type NativeDefenseState,
  type NativePiercingShot,
} from './native-defenses';
import { buildingMaxHp, superchargeBonus, superchargeQuote } from './native-supercharge';
import {
  MERGED_KINDS,
  consumedByMerges,
  isMergedKind,
  gearUpQuote,
  isGearable,
  mergeInputs,
  mergeQuote,
  townHallMergeInputs,
  type MergedKind,
} from './native-merges';
import {
  spellTowerModes,
  townHallWeaponUpgrade,
  type GearMode,
  type SpellTowerMode,
} from './native-defense-stats';
import { alwaysVisibleTrap } from './native-traps';
import { stepHutBuilders } from './native-hut-builders';
import {
  HERO_KINDS,
  HERO_SOURCE,
  PET_DISPLAY,
  PET_KINDS,
  heroLevelCap as rosterLevelCap,
  heroSlots,
  heroUnlockHall,
  heroUnlockTownHall,
  heroUpgradeQuote,
  itemHero,
  itemLevelCap,
  itemName,
  itemRarity,
  itemUpgradeCost,
  petLevelCap,
  petMaxLevel,
  petUnlockHouse,
  petUpgradeQuote,
  validItem,
  type HeroKind,
  type PetKind,
} from './native-hero-data';
import {
  gearFromLegacy,
  unlockCommonItems,
  type HeroGear,
  type HeroRosterProgress,
  type PetProgress,
} from './native-hero-village';

/** Official wiki: Epic equipment from the Trader costs 1,500 gems. */
export const EPIC_ITEM_GEMS = 1500;
import {
  GUARDIAN_KINDS,
  GUARDIAN_NAMES,
  guardianUpgrade,
  stepGuardians,
  type GuardianKind,
} from './native-guardians';
/** Spells that can still destroy buildings or create attackers keep a version 45 battle open. */
const FIGHTING_SPELLS: readonly SpellKind[] = ['earthquake', 'skeleton', 'bat'];
import { SPELL_SOURCE } from './spell-progression';
import { isHeroUnitKind, isPetUnitKind, isSpawnKind, spawnStatsAt } from './native-units';
import { spawnNativeUnit } from './native-troops';
import {
  heroOf,
  heroTroopStats,
  heroUnitKind,
  petOwner,
  petTroopStats,
  petUnitKind,
  type HeroSetup,
  type NativeBattleHero,
} from './native-heroes';
import { activateHero, stepHeroAbilities } from './native-hero-abilities';
import { HERO_UNIT } from './native-hero-data';
export interface Building {
  /** Campaign-only identity; the kind remains a geometry/targeting archetype. */
  npc?: NpcBuildingKind;
  id: number;
  kind: BuildingKind;
  x: number;
  y: number;
  level: number;
  hp: number;
  maxHp: number;
  upgradeEnd?: number;
  /** Set alongside upgradeEnd so progress bars are exact for any timer length. */
  upgradeStart?: number;
  constructing?: boolean;
  stored: number;
  cooldown: number;
  /** Air Sweeper orientation in 45-degree map increments; absent means zero. */
  direction?: number;
  skeletonMode?: SkeletonMode;
  xbowMode?: XbowMode;
  infernoMode?: InfernoMode;
  /** Battle setup ammunition; omitted means full capacity. Not a home inventory. */
  infernoAmmo?: number;
  /** Campaign Spell Tower weapon selected by the source layout. */
  spellTowerWeapon?: SpellTowerWeapon;
  /** Spell Tower spell chosen by the owner; absent means the layout's weapon, then Rage. */
  spellMode?: SpellTowerMode;
  /** Multi-Gear Tower attack mode; absent means Long Range. */
  gearMode?: GearMode;
  /** Town Hall 17 Inferno Artillery weapon level; absent means 1. */
  weaponLevel?: number;
  /** A running builder job that improves the building without raising its level. */
  improving?: 'weapon' | 'gearup' | 'supercharge' | 'guardian';
  /** Completed supercharges at the building's maximum level. */
  supercharge?: number;
  /** Town Hall 18 Guardian selection and its level. */
  guardian?: GuardianKind;
  guardianLevel?: number;
  /** Geared-up Cannon, Archer Tower or Mortar: permanently uses the client Alt* attack. */
  geared?: true;
}
export interface QueueItem {
  kind: TroopKind;
  end: number;
}
export interface SpellQueueItem {
  kind: SpellKind;
  end: number;
}
export interface Layout {
  name: string;
  slots: {
    id: number;
    x: number;
    y: number;
    direction?: number;
    skeletonMode?: SkeletonMode;
    xbowMode?: XbowMode;
    spellTowerWeapon?: SpellTowerWeapon;
    infernoMode?: InfernoMode;
  }[];
}
export type Army = Record<TroopKind, number>;
export type SpellBook = Record<SpellKind, number>;
export interface BattleResult {
  /** Resources removed from the enemy that could not fit in home storages. */
  lostLoot?: CampaignResources;
  gold: number;
  elixir: number;
  dark?: number;
  trophies: number;
  stars: number;
  destruction: number;
}
export interface RaidRecord {
  catalog?: CampaignCatalog;
  id: number;
  at: number;
  index: number;
  practice: boolean;
  duration: number;
  result: BattleResult;
  deployed: Army;
  spells: SpellBook;
  hero?: { level: number; abilityUsed: boolean };
  replay?: ReplayData;
  replayUnavailable?: 'limit';
}
export interface Save {
  nativeCampaign?: NativeCampaignProgress;
  version: 4;
  mapUpgrade?: { moved: number };
  dark: number;
  king?: HeroProgress;
  /** Archer Queen, Minion Prince, Grand Warden, Royal Champion and Dragon Duke progress. */
  heroes?: Partial<Record<Exclude<HeroKind, 'king'>, HeroRosterProgress>>;
  /** Every owned hero item and each hero's two-item loadout (replaces `equipment`). */
  gear?: HeroGear;
  /** Pet levels, hero assignments and the running Pet House upgrade. */
  pets?: PetProgress;
  /** Heroes chosen for attacks, in slot order (limited by Hero Hall slots). */
  heroLineup?: HeroKind[];
  equipment?: KingEquipment;
  ores?: Ores;
  /** Stars banked toward the daily Star Bonus, and when it may next be taken. */
  starBonus?: StarBonus;
  gold: number;
  elixir: number;
  gems: number;
  trophies: number;
  xp: number;
  buildings: Building[];
  obstacles?: Obstacle[];
  obstacleGemIndex?: number;
  obstacleGrowth?: ObstacleGrowth;
  army: Army;
  queue: QueueItem[];
  spells: SpellBook;
  spellQueue: SpellQueueItem[];
  stars: number[];
  campaignLoot?: CampaignLoot;
  lastTick: number;
  nextId: number;
  tutorial: boolean;
  claimedQuests?: string[];
  troopLevels?: Record<TroopKind, number>;
  spellLevels?: Record<SpellKind, number>;
  research?: { kind: ResearchKind; end: number };
  lastArmy?: Army;
  lastSpells?: SpellBook;
  layouts?: Layout[];
  armyPresets?: (ArmyPreset | null)[];
  raidLog?: RaidRecord[];
  settings: { sound: boolean; music: boolean; reducedMotion: boolean };
  stats: { raids: number; destroyed: number; collected: number; built?: number; trained?: number };
}
export interface Unit {
  id: number;
  kind: UnitKind;
  /** Explicit level for units without an army research entry (spawned units). */
  level?: number;
  /** Native roster state created only by version 45+ battles. */
  native?: NativeUnitState;
  /** Legacy battles mark the King; version 46 battles name the hero kind. */
  hero?: HeroKind;
  summoned?: boolean;
  spawnedAt?: number;
  rageUntil?: number;
  spellRageUntil?: number;
  /** Set only by the Invisibility Spell, so a battle without one is byte-identical. */
  invisibleUntil?: number;
  /** Set only on a Clone Spell copy: the moment it fades, whether or not it has fought. */
  fadesAt?: number;
  healTarget?: number;
  defenderTarget?: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  cooldown: number;
  target: number | null;
  path: { x: number; y: number }[];
  pathAt: number;
  attacking: boolean;
  /** Set once a destroyed troop has resolved its death effect. */
  spent?: boolean;
  /** Simulation time of defeat, retained when reconstructing a battle for display. */
  defeatedAt?: number;
  ejected?: boolean;
  springUntil?: number;
  airPush?: AirPush;
  shrink?: ShrinkStatus;
  /** Status applied by late single-player campaign families. */
  late?: LateUnitState;
}
export interface Aura {
  kind: SpellKind;
  x: number;
  y: number;
  end: number;
  start: number;
  pulses: number;
}
export interface MortarShell {
  sourceId: number;
  fromX: number;
  fromY: number;
  x: number;
  y: number;
  launched: number;
  impact: number;
  damage: number;
  radius: number;
}
export interface Battle {
  /** Version 45+: native troop abilities, spawned units, statuses and delayed death effects. */
  nativeRoster?: true;
  nativeSpells?: NativeSpellCast[];
  nativeSpellSequence?: number;
  nativeDeaths?: NativeDeathBlast[];
  nativeChains?: NativeChainHop[];
  buildingEffects?: Record<number, BuildingEffects>;
  /** Scheduled unit arrivals (Ruin Knights, thrown Meteormites). */
  nativePendingSpawns?: NativePendingSpawn[];
  /** Destroyed buildings whose rubble a Ruin Witch has already vacuumed. */
  consumedRubble?: number[];
  /** Active Jump Spell wall set signature; a change forces ground troops to re-route. */
  jumpSignature?: string;
  /** Town Hall 11-18 defense weapon state, keyed by building id. */
  nativeDefenses?: Record<number, NativeDefenseState>;
  /** Cumulative activation housing after each deployment (Eagle Artillery, Builder's Huts). */
  nativeDeployments?: { at: number; space: number }[];
  /** Firespitter balls in flight. */
  nativePiercing?: NativePiercingShot[];
  nativeShotSequence?: number;
  /** Town Hall 18 Guardians have been placed for this battle. */
  guardiansPlaced?: true;
  /** Version 46+: the complete hero roster with equipment and pets. */
  nativeHeroRoster?: true;
  nativeHeroes?: NativeBattleHero[];
  /** Town Hall level of the attacker, for hero scaling. */
  townhall?: number;
  /** Health of recalled troops waiting in the deployment bar, first recalled first redeployed. */
  recalledHp?: Partial<Record<TroopKind, number[]>>;
  catalog?: CampaignCatalog;
  scenery?: CampaignScenery[];
  troopLevels?: Army;
  spellLevels?: SpellBook;
  index: number;
  practice: boolean;
  carriedArmy: Army;
  buildings: Building[];
  units: Unit[];
  remaining: Army;
  spells: SpellBook;
  /** What the raid started with, so emptied slots stay in place. */
  carried: SpellBook;
  auras: Aura[];
  shells: MortarShell[];
  /** Only version-34 playback uses the original fixed Mortar flight. */
  legacyMortarFlight?: true;
  mortars?: Record<number, MortarAttackState>;
  /** Versions 34–35 retain fixed-deadline normal Cannon shots at the previous speed. */
  legacyCannonFlight?: true;
  cannons?: Record<number, CannonAttackState>;
  /** Version 41+ tower arrows travel at source speed while tracking the original target. */
  nativeArcherTowers?: true;
  archerTowerWindups?: Record<number, ArcherTowerWindup>;
  /** Latest actual release per tower; bounded presentation history for version 41+. */
  archerTowerShots?: Record<number, { at: number; x: number; y: number }>;
  archerTowerDestructions?: Record<number, { at: number; x: number; y: number; level: number }>;
  archerTowerReleases?: { id: number; level: number; at: number }[];
  archerTowerHits?: {
    id: string;
    sourceId: number;
    level: number;
    at: number;
    x: number;
    y: number;
    air: boolean;
  }[];
  projectiles?: CombatProjectile[];
  defenseTargets: Record<number, number>;
  defenseStuns: Record<number, number>;
  traps: Record<number, TrapState>;
  gusts?: AirGust[];
  sweepers?: Record<number, SweeperState>;
  airSweepers?: Record<number, SweeperHistory>;
  xbows?: Record<number, XbowState>;
  infernos?: Record<number, InfernoBattleState>;
  nativeInfernoAmmo?: true;
  /** Original Drill destruction presentation, enabled by replay version 40. */
  drillDestructions?: Record<number, { at: number; x: number; y: number; level: number }>;
  teslas?: Record<number, TeslaAttackState>;
  bombTowers?: Record<number, BombTowerAttackState>;
  wizardTowers?: Record<number, WizardTowerAttackState>;
  /** Reveal time in battle seconds. Never persisted in the home village. */
  revealedTeslas?: Record<number, number>;
  deathBombs?: Record<number, DeathBomb>;
  defenders?: Defender[];
  garrisons?: GarrisonState[];
  /** Late single-player campaign family state (version 44+). */
  late?: LateBattleState;
  /** Version 44+ native campaign battles use the client's sub-tile building collision. */
  nativeSubtiles?: true;
  hero?: BattleHero;
  kingQuakes?: KingQuake[];
  elapsed: number;
  /** Practice countdown. Campaign scouting has no deadline. */
  prep: number;
  started: boolean;
  finished: boolean;
  destruction: number;
  stars: number;
  loot: CampaignResources;
  /** Enemy inventory at entry, independent of the home village and future raids. */
  availableLoot?: CampaignResources;
  /** Removed from enemy inventory, including any overflow. */
  lootTaken?: CampaignResources;
  /** Raid-capped storage headroom, preserved in recorded attacks. */
  lootRoom?: CampaignResources;
  result?: BattleResult;
  seed: number;
}
export type FX = {
  type:
    | 'hit'
    | 'destroy'
    | 'projectile'
    | 'impact'
    | 'archertower-pickup'
    | 'archertower-place'
    | 'archertower-cancel'
    | 'darkdrill-pickup'
    | 'darkdrill-place'
    | 'darkdrill-cancel'
    | 'cannon-pickup'
    | 'cannon-place'
    | 'cannon-cancel'
    | 'mortar-fire'
    | 'mortar-pickup'
    | 'mortar-place'
    | 'mortar-cancel'
    | 'collect'
    | 'spawn'
    | 'upgrade'
    | 'spell'
    | 'blast'
    | 'breath'
    | 'trap'
    | 'spring'
    | 'gust'
    | 'airsweeper-pickup'
    | 'airsweeper-place'
    | 'airsweeper-cancel'
    | 'tesla-reveal'
    | 'tesla-zap'
    | 'tesla-pickup'
    | 'tesla-place'
    | 'tesla-cancel'
    | 'bombtower-pickup'
    | 'bombtower-place'
    | 'bombtower-cancel'
    | 'wizardtower-pickup'
    | 'wizardtower-place'
    | 'wizardtower-cancel'
    | 'seekingairmine-pickup'
    | 'seekingairmine-place'
    | 'seekingairmine-cancel'
    | 'spell-native'
    | 'defense-zap'
    | 'quake';
  x: number;
  y: number;
  toX?: number;
  toY?: number;
  color?: number;
  text?: string;
  spell?: SpellKind;
  radius?: number;
  /** Presentation only: weapon identity and the source/target entities. */
  weapon?: Weapon;
  projectileId?: string;
  sourceId?: number;
  targetId?: number;
  targetBuilding?: boolean;
  targetDefender?: boolean;
  sourceDefender?: boolean;
  /** Marks either end of a projectile as airborne so the scene can lift it. */
  fromAir?: boolean;
  toAir?: boolean;
  /** A landmark loss — the Town Hall — worth shaking the screen for. */
  major?: boolean;
};
export const PREP_SECONDS = 30;
export const BATTLE_SECONDS = 180;
export class GameModel {
  state: Save;
  battle: Battle | null = null;
  replay: ReplayPlayback | null = null;
  private recording: ReplayData | null = null;
  private recordingLimitReached = false;
  private recordBattles = true;
  private replayRunner: GameModel | null = null;
  private replayData: ReplayData | null = null;
  private replayStep = 0;
  private replayAction = 0;
  private replayBudget = 0;
  private replaySeekPaused = true;
  private selection: number | null = null;
  private wallGroup: number[] = [];
  wallMove: WallMove | null = null;
  wallAxis: WallAxis | null = null;
  get selected() {
    return this.selection;
  }
  set selected(value: number | null) {
    this.selection = value;
    this.wallMove = null;
    this.wallGroup = [];
    this.wallAxis = null;
  }
  placement: BuildingKind | null = null;
  moving: number | null = null;
  activeHero = false;
  /** Version 46 battles select which hero the next deployment places. */
  activeHeroKind: HeroKind | null = null;
  activeTroop: TroopKind = 'swordsman';
  /** When set, tapping the battlefield casts this spell instead of deploying. */
  activeSpell: SpellKind | null = null;
  editing = false;
  private undoStack: Layout['slots'][] = [];
  private redoStack: Layout['slots'][] = [];
  /** True once the current drag has recorded its single undo entry. */
  private dragOpen = false;
  private draggedBuilding: number | null = null;
  onChange = (_passive = false) => {};
  onEffect = (_fx: FX) => {};
  onToast = (_message: string) => {};
  revision = 0;
  clock = Date.now();
  constructor(saved?: Save) {
    this.state = saved ?? initialSave();
    expandArmyRoster(this.state);
    this.state.dark ??= 0;
    this.tick(Date.now());
  }
  changed(passive = false) {
    this.revision++;
    this.onChange(passive);
  }
  notify(message: string) {
    this.onToast(message);
  }
  get obstacles() {
    return this.state.obstacles ?? [];
  }
  get selectedObstacle() {
    return !this.battle && this.selected !== null && this.selected < 0
      ? this.obstacles.find((o) => o.id === -this.selected!)
      : undefined;
  }
  removeObstacle(id: number) {
    if (this.battle) return false;
    const o = this.obstacles.find((o) => o.id === id);
    if (!o || o.removeEnd) return false;
    const d = OBSTACLES[o.kind];
    if (this.state[d.resource] < d.cost) {
      this.notify(`Not enough ${d.resource}.`);
      return false;
    }
    this.state[d.resource] -= d.cost;
    o.removeStart = this.clock;
    o.removeEnd = this.clock + d.seconds * 1000;
    this.notify(`Clearing ${d.name.toLowerCase()}. No builder needed.`);
    this.changed();
    return true;
  }
  cancelObstacleRemoval(id: number) {
    if (this.battle) return false;
    const o = this.obstacles.find((o) => o.id === id);
    if (!o?.removeEnd) return false;
    const d = OBSTACLES[o.kind];
    this.state[d.resource] += d.cost;
    delete o.removeEnd;
    delete o.removeStart;
    this.notify(`Removal canceled. ${d.cost.toLocaleString()} ${d.resource} refunded.`);
    this.changed();
    return true;
  }
  finishObstacleRemoval(id: number) {
    if (this.battle) return false;
    const o = this.obstacles.find((o) => o.id === id);
    if (!o?.removeEnd) return false;
    const cost = gemCost((o.removeEnd - this.clock) / 1000);
    if (this.state.gems < cost) {
      this.notify('Not enough gems.');
      return false;
    }
    this.state.gems -= cost;
    o.removeEnd = this.clock;
    this.tick(this.clock);
    return true;
  }
  get buildings() {
    return this.battle ? this.battle.buildings : this.state.buildings;
  }
  get townhall() {
    return this.state.buildings.find((b) => b.kind === 'townhall');
  }
  get townhallLevel() {
    return this.townhall?.level ?? 1;
  }
  maxLevel(kind: BuildingKind) {
    return maxLevelFor(kind, this.townhallLevel);
  }
  /** Client counts minus the inputs merged defenses and the Town Hall 17 merge consumed. */
  maxCount(kind: BuildingKind) {
    return Math.max(
      0,
      maxCountFor(kind, this.townhallLevel) -
        consumedByMerges(
          kind,
          this.state.buildings,
          // A running Town Hall upgrade has already merged its inputs.
          this.townhallLevel + (this.townhall?.upgradeEnd && !this.townhall.improving ? 1 : 0),
        ),
    );
  }
  /** Merge inputs available now for a merged defense, or the reason it cannot start. */
  mergeCandidates(result: MergedKind, anchor?: number) {
    const quote = mergeQuote(result);
    const inputs = mergeInputs(result);
    if (this.townhallLevel < quote.townhall)
      return { issue: `Requires Town Hall ${quote.townhall}` };
    if (this.countOf(result) >= this.maxCount(result)) return { issue: 'All merges built' };
    const chosen: Building[] = [];
    const pool = this.state.buildings
      .filter((b) => !b.upgradeEnd && !b.constructing)
      .sort((a, b) => Number(b.id === anchor) - Number(a.id === anchor) || a.id - b.id);
    for (const input of inputs) {
      const match = pool.find(
        (b) =>
          !chosen.includes(b) &&
          b.kind === input.kind &&
          b.level >= input.level &&
          !!b.geared === input.geared,
      );
      if (!match)
        return {
          issue: `Needs ${input.geared ? 'a geared-up ' : ''}${BUILDINGS[input.kind].name} level ${input.level}`,
        };
      chosen.push(match);
    }
    return { inputs: chosen, quote };
  }
  /** Merge two maxed defenses into one merged defense at the first input's position. */
  merge(result: MergedKind, anchor?: number) {
    if (this.battle) return false;
    const candidates = this.mergeCandidates(result, anchor);
    if (!candidates.inputs) {
      this.notify(candidates.issue!);
      return false;
    }
    const { inputs, quote } = candidates;
    if (this.busy >= this.builders) {
      this.notify('All builders are busy.');
      return false;
    }
    if (this.state[quote.resource] < quote.cost) {
      this.notify(`You need ${quote.cost.toLocaleString()} ${quote.resource}.`);
      return false;
    }
    const [first] = inputs;
    if (BUILDINGS[first.kind].size !== BUILDINGS[result].size) return false;
    this.cancelNativeHandling();
    this.state[quote.resource] -= quote.cost;
    const removed = new Set(inputs.map((b) => b.id));
    this.state.buildings = this.state.buildings.filter((b) => !removed.has(b.id));
    const merged = makeBuilding(this.state.nextId++, result, first.x, first.y, 1);
    merged.constructing = true;
    merged.upgradeStart = this.clock;
    merged.upgradeEnd = this.clock + quote.seconds * 1000;
    this.state.buildings.push(merged);
    this.selected = merged.id;
    this.notify(`Merging into ${BUILDINGS[result].name} — ${formatTime(quote.seconds)}.`);
    this.changed();
    return true;
  }
  /** Master Builder gear-up. This village has no Builder Base, so its prerequisite is waived. */
  gearUp(id: number) {
    if (this.battle) return false;
    const b = this.state.buildings.find((v) => v.id === id);
    if (!b || !isGearable(b.kind) || b.geared || b.upgradeEnd || b.constructing) return false;
    const quote = gearUpQuote(b.kind);
    if (!quote || b.level < quote.level) return false;
    if (
      this.state.buildings.filter(
        (v) => v.kind === b.kind && (v.geared || v.improving === 'gearup'),
      ).length >= quote.limit
    ) {
      this.notify(`Only ${quote.limit} ${BUILDINGS[b.kind].name} can be geared up.`);
      return false;
    }
    if (this.busy >= this.builders) {
      this.notify('All builders are busy.');
      return false;
    }
    if (this.state[quote.resource] < quote.cost) {
      this.notify(`You need ${quote.cost.toLocaleString()} ${quote.resource}.`);
      return false;
    }
    this.state[quote.resource] -= quote.cost;
    b.improving = 'gearup';
    b.upgradeStart = this.clock;
    b.upgradeEnd = this.clock + quote.seconds * 1000;
    this.notify(`Gearing up ${BUILDINGS[b.kind].name} — ${formatTime(quote.seconds)}.`);
    this.changed();
    return true;
  }
  /** Why the Town Hall cannot move to its next level yet (merges), or null. */
  townHallMergeIssue(level = this.townhallLevel) {
    for (const result of MERGED_KINDS) {
      const available = maxCountFor(result, level);
      if (available > 0 && this.countOf(result) < available)
        return `Build all ${available} ${BUILDINGS[result].name} merges first.`;
    }
    for (const input of townHallMergeInputs(level + 1)) {
      const ready = this.state.buildings.some(
        (b) => b.kind === input.kind && b.level >= input.level && !b.upgradeEnd && !b.constructing,
      );
      if (!ready) return `Needs ${BUILDINGS[input.kind].name} level ${input.level} to merge.`;
    }
    return null;
  }
  countOf(kind: BuildingKind) {
    return this.state.buildings.filter((b) => b.kind === kind).length;
  }
  get capacity() {
    return this.state.buildings
      .filter((b) => b.kind === 'camp' && !b.constructing)
      .reduce((n, b) => n + campCapacity(b.level), 0);
  }
  get spellCapacity() {
    return (
      spellFactoryCapacity(facilityLevel(this.state.buildings, 'spellfactory')) +
      (nativeProgression.buildings.darkspellfactory.levels[
        facilityLevel(this.state.buildings, 'darkspellfactory') - 1
      ]?.capacity ?? 0)
    );
  }
  get laboratory() {
    return this.state.buildings
      .filter((b) => b.kind === 'laboratory' && !b.constructing)
      .reduce<Building | undefined>(
        (best, b) => (!best || b.level > best.level ? b : best),
        undefined,
      );
  }
  get armySize() {
    return armySpace(this.state.army);
  }
  get queuedSize() {
    return this.state.queue.reduce((n, q) => n + TROOPS[q.kind].space, 0);
  }
  get spellCount() {
    return SPELL_KEYS.reduce((n, k) => n + (this.state.spells[k] ?? 0), 0);
  }
  get spellHousing() {
    return spellSpace(this.state.spells);
  }
  get queuedSpellHousing() {
    return this.state.spellQueue.reduce((n, q) => n + SPELLS[q.kind].space, 0);
  }
  get queuedSpellCount() {
    return this.state.spellQueue.length;
  }
  troopLevel(kind: TroopKind) {
    return this.battle?.troopLevels?.[kind] ?? this.state.troopLevels?.[kind] ?? 1;
  }
  troopStats(kind: TroopKind, level = this.troopLevel(kind)) {
    return troopStatsAt(kind, level);
  }
  /** Battle stats for any unit; spawned units, heroes and pets carry their own level. */
  unitStats(u: Pick<Unit, 'kind' | 'level' | 'id'>) {
    const battle = this.battle;
    if (battle?.nativeHeroes && u.id !== undefined) {
      const hero = heroOf(battle, { id: u.id });
      if (hero) return heroTroopStats(hero, battle.townhall ?? this.townhallLevel);
      const owner = petOwner(battle, { id: u.id });
      if (owner?.pet) return petTroopStats(owner.pet);
    }
    if (isHeroUnitKind(u.kind) || isPetUnitKind(u.kind) || isSpawnKind(u.kind))
      return spawnStatsAt(u.kind, u.level ?? 1);
    return this.troopStats(u.kind as TroopKind, u.level ?? this.troopLevel(u.kind as TroopKind));
  }
  spellLevel(kind: SpellKind) {
    return this.battle?.spellLevels?.[kind] ?? this.state.spellLevels?.[kind] ?? 1;
  }
  spellStats(kind: SpellKind, level = this.spellLevel(kind)) {
    return spellStatsAt(kind, level);
  }
  researchLevel(kind: ResearchKind) {
    return isSpellKind(kind) ? this.spellLevel(kind) : this.troopLevel(kind);
  }
  researchCost(kind: ResearchKind) {
    return isSpellKind(kind)
      ? (spellProgression(kind, this.spellLevel(kind) + 1)?.cost ?? 0)
      : researchCost(kind, this.troopLevel(kind));
  }
  researchSeconds(kind: ResearchKind) {
    return isSpellKind(kind)
      ? (spellProgression(kind, this.spellLevel(kind) + 1)?.seconds ?? 0)
      : researchSeconds(kind, this.troopLevel(kind));
  }
  researchLaboratory(kind: ResearchKind) {
    return isSpellKind(kind)
      ? (spellProgression(kind, this.spellLevel(kind) + 1)?.laboratory ?? Infinity)
      : researchLaboratory(kind, this.troopLevel(kind));
  }
  researchTroop(kind: TroopKind) {
    this.research(kind);
  }
  research(kind: ResearchKind) {
    if (this.battle) return;
    const lab = this.laboratory;
    if (!lab) return this.notify('Complete a laboratory before starting research.');
    const spell = isSpellKind(kind);
    const name = spell ? SPELLS[kind].name : TROOPS[kind].name;
    if (spell ? !this.spellUnlocked(kind) : !this.troopUnlocked(kind))
      return this.notify(
        `Unlock ${name} at ${spell ? `Spell Factory level ${SPELL_UNLOCK[kind]}` : `Barracks level ${TROOP_UNLOCK[kind]}`} first.`,
      );
    if (this.state.research) return this.notify('Research is already in progress.');
    if (this.researchLevel(kind) >= (spell ? maxSpellLevelFor(kind) : maxTroopLevel(kind)))
      return this.notify(`This ${spell ? 'spell' : 'troop'} is at its maximum level.`);
    const requiredLab = this.researchLaboratory(kind);
    if (lab.level < requiredLab)
      return this.notify(`Upgrade your laboratory to level ${requiredLab}.`);
    const cost = this.researchCost(kind);
    const researchResource = (
      spell ? spellFactory(kind) === 'darkspellfactory' : troopFacility(kind) === 'darkbarracks'
    )
      ? 'dark'
      : 'elixir';
    if (this.state[researchResource] < cost)
      return this.notify(`Not enough ${researchResource === 'dark' ? 'dark elixir' : 'elixir'}.`);
    this.state[researchResource] -= cost;
    this.state.research = {
      kind,
      end: this.clock + this.researchSeconds(kind) * 1000,
    };
    this.notify(`Researching level ${this.researchLevel(kind) + 1} ${name}.`);
    this.changed();
  }
  finishResearch() {
    const r = this.state.research;
    if (!r) return;
    const cost = gemCost((r.end - this.clock) / 1000);
    if (this.state.gems < cost) return this.notify('Not enough gems.');
    this.state.gems -= cost;
    r.end = this.clock;
    this.tick(this.clock);
  }
  get quests() {
    return [
      {
        id: 'gold-rush',
        title: 'Gold rush',
        description: 'Collect 10,000 resources',
        progress: this.state.stats.collected,
        target: 10000,
        reward: 15,
        icon: 'Coins',
      },
      {
        id: 'first-raid',
        title: 'First blood',
        description: 'Complete your first raid',
        progress: this.state.stats.raids,
        target: 1,
        reward: 20,
        icon: 'Swords',
      },
      {
        id: 'wall-breaker',
        title: 'Wall breaker',
        description: 'Destroy 25 enemy buildings',
        progress: this.state.stats.destroyed,
        target: 25,
        reward: 25,
        icon: 'Castle',
      },
      {
        id: 'valley-explorer',
        title: 'Valley explorer',
        description: 'Earn 12 campaign stars',
        progress: Math.max(
          this.state.stars.reduce((a, b) => a + b, 0),
          (this.state.nativeCampaign?.stars ?? []).reduce((a, b) => a + b, 0),
        ),
        target: 12,
        reward: 40,
        icon: 'Star',
      },
      {
        id: 'master-builder',
        title: 'Master builder',
        description: 'Raise 15 buildings',
        progress: this.state.stats.built ?? 0,
        target: 15,
        reward: 30,
        icon: 'Hammer',
      },
      {
        id: 'drill-sergeant',
        title: 'Drill sergeant',
        description: 'Train 100 troops',
        progress: this.state.stats.trained ?? 0,
        target: 100,
        reward: 35,
        icon: 'UsersRound',
      },
      {
        id: 'town-planner',
        title: 'Town planner',
        description: 'Reach Town Hall level 4',
        progress: this.townhallLevel,
        target: 4,
        reward: 50,
        icon: 'LayoutGrid',
      },
      {
        id: 'high-flier',
        title: 'High flier',
        description: 'Climb to 1,500 trophies',
        progress: this.state.trophies,
        target: 1500,
        reward: 45,
        icon: 'Trophy',
      },
    ].map((q) => ({
      ...q,
      claimed: this.state.claimedQuests?.includes(q.id) ?? false,
    }));
  }
  claimQuest(id: string) {
    const quest = this.quests.find((q) => q.id === id);
    if (!quest || quest.claimed || quest.progress < quest.target) return false;
    this.state.claimedQuests ??= [];
    this.state.claimedQuests.push(id);
    this.state.gems += quest.reward;
    this.state.xp += 20;
    this.notify(`${quest.title} complete! +${quest.reward} gems`);
    this.changed();
    return true;
  }
  get chiefLevel() {
    return Math.max(1, Math.floor(this.state.xp / 100));
  }

  get builders() {
    return this.state.buildings.filter((b) => b.kind === 'builder' && !b.constructing).length;
  }
  /** Timed builder reservations. Walls require a free builder but finish immediately. */
  get busy() {
    return (
      this.state.buildings.filter((b) => b.upgradeEnd && b.kind !== 'wall').length +
      Number(!!this.state.king?.upgradeEnd) +
      Object.values(this.state.heroes ?? {}).filter((hero) => hero?.upgradeEnd).length
    );
  }
  resourceCap(kind: Resource) {
    // The original counts the Town Hall's own store toward every cap, stores on top of it.
    const hall = townHallCapacity(this.townhall?.level ?? 1, kind);
    if (kind === 'dark')
      return (
        hall +
        this.state.buildings
          .filter((b) => b.kind === 'darkstorage' && !b.constructing)
          .reduce((n, b) => n + darkStorageCapacity(b.level), 0)
      );
    return (
      hall +
      this.state.buildings
        .filter(
          (b) => b.kind === (kind === 'gold' ? 'goldstorage' : 'elixirstorage') && !b.constructing,
        )
        .reduce((n, b) => n + storageCapacity(b.level), 0)
    );
  }
  tick(now: number) {
    // A non-finite time would poison the clock and every timer derived from it, turning a
    // caller's missing timestamp into an upgrade that can never complete.
    if (!Number.isFinite(now)) throw new Error(`Invalid clock time: ${now}`);
    this.clock = now;
    let changed = false;
    let structural = false;
    if (
      !this.state.obstacles ||
      !this.state.obstacleGrowth ||
      this.state.obstacleGemIndex === undefined
    ) {
      this.state.obstacles ??= initialObstacles(this.state.buildings);
      this.state.obstacleGemIndex ??= 0;
      this.state.obstacleGrowth ??= initialObstacleGrowth(this.obstacles, now);
      structural = changed = true;
    }
    const elapsedHomeSeconds = Math.max(0, now - this.state.lastTick) / 1000;
    const dt = Math.min(elapsedHomeSeconds, 8 * 3600);
    for (const b of this.state.buildings) {
      // Audited building health is derived from its level. Preserve the damage fraction
      // when loading prototype saves; recorded battle snapshots remain untouched.
      if (
        (facilityProgression(b.kind, b.level) ||
          [
            'wall',
            'cannon',
            'archertower',
            'mortar',
            'airdefense',
            'wizardtower',
            'airsweeper',
            'camp',
            'darkstorage',
            'darkdrill',
          ].includes(b.kind)) &&
        b.maxHp !== buildingMaxHp(b)
      ) {
        const hp = buildingMaxHp(b);
        b.hp = b.maxHp > 0 ? Math.min(1, b.hp / b.maxHp) * hp : hp;
        b.maxHp = hp;
        structural = changed = true;
      }
      const productionInterval = b.kind === 'darkdrill' ? elapsedHomeSeconds : dt;
      const productionSeconds = b.upgradeEnd
        ? Math.max(0, Math.min(productionInterval, (now - b.upgradeEnd) / 1000))
        : productionInterval;
      if (b.upgradeEnd && b.upgradeEnd <= now) {
        if (b.improving === 'weapon') b.weaponLevel = (b.weaponLevel ?? 1) + 1;
        else if (b.improving === 'gearup') b.geared = true;
        else if (b.improving === 'supercharge') b.supercharge = (b.supercharge ?? 0) + 1;
        else if (b.improving === 'guardian') b.guardianLevel = (b.guardianLevel ?? 1) + 1;
        else if (!b.constructing) b.level++;
        delete b.improving;
        b.constructing = false;
        b.upgradeEnd = undefined;
        b.upgradeStart = undefined;
        b.maxHp = buildingMaxHp(b);
        b.hp = b.maxHp;
        structural = true;
        this.notify(`${BUILDINGS[b.kind].name} is ready!`);
        this.onEffect({
          type: 'upgrade',
          x: b.x + BUILDINGS[b.kind].size / 2,
          y: b.y + BUILDINGS[b.kind].size / 2,
        });
        changed = true;
      }
      if (
        (b.kind === 'goldmine' || b.kind === 'collector' || b.kind === 'darkdrill') &&
        !b.upgradeEnd
      ) {
        const before = b.stored;
        const production = nativeProgression.buildings[b.kind].levels[b.level - 1];
        const charged = superchargeBonus(b.kind, b.supercharge);
        b.stored =
          b.kind === 'darkdrill'
            ? produceDarkElixir(b.level, b.stored, productionSeconds, charged)
            : b.level > 12 && production
              ? Math.min(
                  production.productionCapacity + charged.capacity,
                  b.stored +
                    (productionSeconds * (production.production + charged.production)) / 3600,
                )
              : Math.min(10000 * b.level, b.stored + productionSeconds * 3 * b.level);
        if (Math.floor(before) !== Math.floor(b.stored)) changed = true;
      }
    }
    const growth = this.state.obstacleGrowth!;
    const nextGrowth = growth.nextAt;
    const obstacleEvents = advanceObstacles(this.obstacles, this.state.buildings, growth, now);
    if (growth.nextAt !== nextGrowth) changed = true;
    if (obstacleEvents.grown.length) structural = changed = true;
    for (const o of obstacleEvents.removed) {
      if (this.selected === -o.id) this.selected = null;
      const gems = OBSTACLE_GEMS[this.state.obstacleGemIndex ?? 0];
      this.state.obstacleGemIndex = ((this.state.obstacleGemIndex ?? 0) + 1) % OBSTACLE_GEMS.length;
      this.state.gems += gems;
      this.state.xp += 3;
      structural = changed = true;
      this.notify(`${OBSTACLES[o.kind].name} cleared! ${gems ? `+${gems} gems · ` : ''}+3 XP`);
      if (!this.battle) this.onEffect({ type: 'upgrade', x: o.x + 1, y: o.y + 1 });
    }
    if (this.heroHall && !this.state.king) {
      this.state.king = { level: 1 };
      structural = changed = true;
      this.notify('The Barbarian King has joined your village!');
    }
    if (this.state.king?.upgradeEnd && this.state.king.upgradeEnd <= now) {
      this.state.king.level++;
      delete this.state.king.upgradeEnd;
      delete this.state.king.upgradeStart;
      structural = changed = true;
      this.notify(`Barbarian King reached level ${this.state.king.level}!`);
    }
    if (this.advanceHeroRoster(now)) structural = changed = true;
    // Older saves may still contain paid training queues. Complete those once;
    // new armies are prepared immediately and never create queue entries.
    while (this.state.queue.length) {
      const q = this.state.queue.shift()!;
      this.state.army[q.kind]++;
      structural = true;
      changed = true;
    }
    while (this.state.spellQueue.length) {
      const q = this.state.spellQueue.shift()!;
      this.state.spells[q.kind]++;
      structural = true;
      changed = true;
    }
    if (this.state.research && this.state.research.end <= now) {
      const { kind } = this.state.research;
      let name: string, level: number;
      if (isSpellKind(kind)) {
        this.state.spellLevels ??= defaultSpellLevels();
        level = this.state.spellLevels[kind] = Math.min(
          maxSpellLevelFor(kind),
          this.state.spellLevels[kind] + 1,
        );
        name = SPELLS[kind].name;
      } else {
        this.state.troopLevels ??= Object.fromEntries(TROOP_KEYS.map((k) => [k, 1])) as Record<
          TroopKind,
          number
        >;
        level = this.state.troopLevels[kind] = Math.min(
          maxTroopLevel(kind),
          this.state.troopLevels[kind] + 1,
        );
        name = TROOPS[kind].name;
      }
      delete this.state.research;
      this.state.xp += 30;
      this.notify(`${name} upgraded to level ${level}!`);
      structural = true;
      changed = true;
    }
    this.state.lastTick = now;
    if (changed) this.changed(!structural);
  }
  collect(id?: number) {
    let gold = 0,
      elixir = 0,
      dark = 0;
    // Why nothing came out, so a full storage never reads as an idle collector.
    let full: Resource | null = null;
    let unfinished = false;
    for (const b of this.state.buildings) {
      if (id !== undefined && b.id !== id) continue;
      const k = producedResource(b.kind);
      if (!k || b.stored < 1) continue;
      // A building still being raised or upgraded keeps what it holds.
      if (b.upgradeEnd) {
        unfinished = true;
        continue;
      }
      const amount = Math.min(Math.floor(b.stored), this.resourceCap(k) - this.state[k]);
      if (amount <= 0) {
        full ??= k;
        continue;
      }
      this.state[k] += amount;
      b.stored -= amount;
      if (k === 'gold') gold += amount;
      else if (k === 'elixir') elixir += amount;
      else dark += amount;
      this.onEffect({
        type: 'collect',
        x: b.x + BUILDINGS[b.kind].size / 2,
        y: b.y + BUILDINGS[b.kind].size / 2,
        color: k === 'gold' ? 0xffd34b : k === 'dark' ? 0x514076 : 0xd567ff,
        text: `+${amount.toLocaleString()}`,
      });
    }
    if (gold + elixir + dark) {
      this.state.stats.collected += gold + elixir + dark;
      this.notify(
        `Collected ${gold.toLocaleString()} gold · ${elixir.toLocaleString()} elixir${dark ? ` · ${dark.toLocaleString()} dark elixir` : ''}`,
      );
      this.changed();
    } else if (full === 'dark' && this.resourceCap('dark') === 0)
      this.notify('Build a Dark Elixir Storage to hold what your drills bring up.');
    else if (full) this.notify(`Your ${full === 'dark' ? 'dark elixir' : full} storages are full.`);
    else if (unfinished) this.notify('That building keeps its resources until it is ready.');
    else this.notify('Your collectors are working. Come back in a moment.');
  }
  canPlace(kind: BuildingKind, x: number, y: number, ignore?: number) {
    const size = BUILDINGS[kind].size;
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < BUILD_MIN ||
      y < BUILD_MIN ||
      x + size > BUILD_MAX ||
      y + size > BUILD_MAX
    )
      return false;
    if (overlapsObstacle(this.obstacles, x, y, size)) return false;
    return !this.state.buildings.some(
      (b) =>
        b.id !== ignore &&
        x < b.x + BUILDINGS[b.kind].size &&
        x + size > b.x &&
        y < b.y + BUILDINGS[b.kind].size &&
        y + size > b.y,
    );
  }
  beginBuild(kind: BuildingKind) {
    if (this.battle) return;
    const d = BUILDINGS[kind];
    if (isMergedKind(kind))
      return this.notify(
        `${d.name} is created by merging defenses. Select a maxed input to merge.`,
      );
    const limit = this.maxCount(kind);
    if (limit === 0)
      return this.notify(`Upgrade your Town Hall to unlock the ${d.name.toLowerCase()}.`);
    if (this.countOf(kind) >= limit)
      return this.notify(
        BUILDING_COUNTS[kind].some((count) => count > limit)
          ? `Town Hall ${this.townhallLevel} allows ${limit} ${d.name.toLowerCase()}. Upgrade it for more.`
          : `Your village already has its maximum number of ${d.name.toLowerCase()}.`,
      );
    const price = buildPrice(kind, this.countOf(kind));
    if (this.state[price.resource] < price.cost)
      return this.notify(`Not enough ${price.resource}.`);
    if (!isTrap(kind) && this.busy >= this.builders)
      return this.notify('All builders are busy. Finish an upgrade first.');
    this.cancelNativeHandling();
    this.selected = null;
    this.moving = null;
    this.placement = kind;
    this.changed();
  }
  place(x: number, y: number) {
    if (this.battle || !this.placement) return false;
    const kind = this.placement,
      d = BUILDINGS[kind];
    if (!this.canPlace(kind, x, y, this.moving ?? undefined)) {
      this.notify('Choose a clear space inside the village.');
      return false;
    }
    if (this.moving !== null) {
      const b = this.state.buildings.find((b) => b.id === this.moving)!;
      if (this.editing) this.recordPositions();
      b.x = x;
      b.y = y;
      this.selected = b.id;
      this.moving = null;
      this.placement = null;
      this.notify('');
      this.nativeBuildingHandling(b, 'place');
      this.changed();
      return true;
    }
    const price = buildPrice(kind, this.countOf(kind));
    if (
      // A merged defense is built by merging its inputs, never bought from the shop.
      isMergedKind(kind) ||
      this.state[price.resource] < price.cost ||
      this.countOf(kind) >= this.maxCount(kind) ||
      (!isTrap(kind) && this.busy >= this.builders)
    ) {
      this.notify('Unable to build. Check your resources and builders.');
      return false;
    }
    this.state[price.resource] -= price.cost;
    const b = makeBuilding(this.state.nextId++, kind, x, y, 1);
    // A home Spell Tower always carries a weapon; the original picks one on placement too.
    if (kind === 'spelltower') b.spellTowerWeapon = 'rage';
    if (d.build > 0) {
      b.constructing = true;
      b.upgradeStart = this.clock;
      b.upgradeEnd = this.clock + d.build * 1000;
    }
    this.state.buildings.push(b);
    if (kind !== 'wall') this.state.stats.built = (this.state.stats.built ?? 0) + 1;
    this.placement = null;
    this.selected = b.id;
    // Walls are laid in runs, so the tool stays in hand while another is affordable.
    if (
      kind === 'wall' &&
      this.state[d.resource] >= d.cost &&
      this.countOf(kind) < this.maxCount(kind)
    ) {
      this.placement = 'wall';
      this.selected = null;
    }
    this.changed();
    this.notify(
      d.build === 0 ? `${d.name} placed.` : `Construction started — ${formatTime(d.build)}.`,
    );
    this.nativeBuildingHandling(b, 'place');
    return true;
  }
  get selectedWalls(): Building[] {
    if (this.battle || this.placement || this.wallMove) return [];
    const anchor = this.state.buildings.find((b) => b.id === this.selected && b.kind === 'wall');
    if (!anchor) return [];
    const ids = new Set(this.wallGroup.length ? this.wallGroup : [anchor.id]);
    return this.state.buildings.filter((b) => b.kind === 'wall' && ids.has(b.id));
  }
  selectedWallRow(axis: WallAxis) {
    return this.selected === null ? [] : wallRow(this.state.buildings, this.selected, axis);
  }
  selectWallRow() {
    if (!this.selectedWalls.length) return false;
    const x = this.selectedWallRow('x'),
      y = this.selectedWallRow('y');
    const axis =
      this.wallAxis === 'x' ? 'y' : this.wallAxis === 'y' ? 'x' : x.length >= y.length ? 'x' : 'y';
    const row = axis === 'x' ? x : y;
    if (row.length < 2) return false;
    this.wallAxis = axis;
    this.wallGroup = row.map((b) => b.id);
    this.changed();
    return true;
  }
  selectSingleWall() {
    this.selected = this.selected;
    this.changed();
  }
  canAdjustWallSelection(delta: number) {
    if (this.editing || this.wallAxis || ![-10, -1, 1, 10].includes(delta)) return false;
    const walls = this.selectedWalls;
    const anchor = walls.find((b) => b.id === this.selected);
    if (!anchor) return false;
    const count = walls.length + delta;
    if (count < 1) return false;
    if (delta < 0) return true;
    if (anchor.level >= this.maxLevel('wall')) return false;
    const funds = Math.max(this.state.gold, anchor.level >= 4 ? this.state.elixir : 0);
    return (
      count <= matchingWalls(this.state.buildings, anchor.id).length &&
      count * this.upgradeCost(anchor) <= funds
    );
  }
  adjustWallSelection(delta: number) {
    if (!this.canAdjustWallSelection(delta)) return false;
    const count = this.selectedWalls.length + delta;
    this.wallGroup = matchingWalls(this.state.buildings, this.selected!)
      .slice(0, count)
      .map((b) => b.id);
    this.changed();
    return true;
  }
  wallUpgradeQuote(ids: readonly number[], resource: WallResource) {
    const selected = ids.map((id) => this.state.buildings.find((b) => b.id === id));
    const valid =
      ids.length > 0 &&
      new Set(ids).size === ids.length &&
      selected.every((b) => b?.kind === 'wall') &&
      (resource === 'gold' || resource === 'elixir');
    const walls = valid
      ? (selected as Building[]).filter(
          (b) => !b.constructing && !b.upgradeEnd && b.level < this.maxLevel('wall'),
        )
      : [];
    const cost = walls.reduce((total, b) => total + this.upgradeCost(b), 0);
    const issue = this.battle
      ? 'Return home to upgrade walls.'
      : !valid
        ? 'Select walls in your village.'
        : !walls.length
          ? 'These walls are at the maximum for your Town Hall.'
          : resource === 'elixir' && selected.some((b) => b!.level < 4)
            ? 'Elixir upgrades start at wall level 4 → 5. Upgrade lower-level walls with gold first.'
            : this.busy >= this.builders
              ? 'A free builder is needed for instant wall upgrades.'
              : this.state[resource] < cost
                ? `You need ${cost.toLocaleString()} ${resource}.`
                : null;
    return { walls, cost, skipped: ids.length - walls.length, issue };
  }
  upgradeWalls(ids: readonly number[], resource: WallResource) {
    const quote = this.wallUpgradeQuote(ids, resource);
    if (quote.issue) {
      this.notify(quote.issue);
      return false;
    }
    // Validate the whole purchase before charging once; no transient timers or builder reservations.
    this.state[resource] -= quote.cost;
    for (const b of quote.walls) {
      b.level++;
      b.maxHp = buildingHp(b.kind, b.level);
      b.hp = b.maxHp;
    }
    const anchor = quote.walls.find((b) => b.id === this.selected) ?? quote.walls[0];
    this.onEffect({ type: 'upgrade', x: anchor.x + 0.5, y: anchor.y + 0.5 });
    this.notify(
      `${quote.walls.length === 1 ? 'Wall' : `${quote.walls.length} walls`} upgraded instantly.`,
    );
    this.changed();
    return true;
  }
  beginWallMove() {
    const walls = this.selectedWalls;
    const anchor = walls.find((b) => b.id === this.selected);
    if (!anchor || !this.wallAxis || walls.length < 2) return false;
    this.wallMove = {
      anchorId: anchor.id,
      axis: this.wallAxis,
      source: walls.map(({ id, x, y }) => ({ id, x, y })),
      x: anchor.x,
      y: anchor.y,
      turns: 0,
    };
    this.changed();
    return true;
  }
  get wallPreview() {
    return this.wallMove && !this.battle ? wallDestinations(this.wallMove) : [];
  }
  get wallPlacementIssue() {
    if (this.battle || !this.wallMove) return 'Select a wall row at home.';
    return wallMoveIssue(this.wallMove, this.state.buildings, this.obstacles);
  }
  previewWallMove(x: number, y: number) {
    if (this.battle || !this.wallMove || !Number.isInteger(x) || !Number.isInteger(y)) return false;
    if (this.wallMove.x === x && this.wallMove.y === y) return true;
    this.wallMove.x = x;
    this.wallMove.y = y;
    this.changed();
    return true;
  }
  rotateWallMove() {
    if (this.battle || !this.wallMove) return false;
    this.wallMove.turns = (this.wallMove.turns + 1) % 4;
    this.changed();
    return true;
  }
  confirmWallMove() {
    const issue = this.wallPlacementIssue;
    if (issue) {
      this.notify(issue);
      return false;
    }
    const move = this.wallMove!,
      target = this.wallPreview;
    const changed = target.some((s, i) => s.x !== move.source[i].x || s.y !== move.source[i].y);
    if (changed && this.editing) this.recordPositions();
    // Every destination was validated against the current village before any coordinate changes.
    for (const slot of target) {
      const b = this.state.buildings.find((b) => b.id === slot.id)!;
      b.x = slot.x;
      b.y = slot.y;
    }
    this.selected = move.anchorId;
    this.wallGroup = target.map((b) => b.id);
    this.wallAxis = move.turns % 2 ? (move.axis === 'x' ? 'y' : 'x') : move.axis;
    this.notify(changed ? `${target.length} walls moved.` : 'Wall row kept in place.');
    this.changed();
    return true;
  }
  upgradeCost(b: Building) {
    return upgradeCost(b.kind, b.level);
  }
  upgradeSeconds(b: Building) {
    return upgradeSeconds(b.kind, b.level);
  }
  /** Gems to skip whatever is left of this building's timer. */
  finishCost(b: Building) {
    return b.upgradeEnd ? gemCost((b.upgradeEnd - this.clock) / 1000) : 0;
  }
  upgrade(id: number) {
    if (this.battle) return;
    if (this.state.buildings.find((b) => b.id === id)?.kind === 'wall') {
      this.upgradeWalls([id], 'gold');
      return;
    }
    const b = this.state.buildings.find((b) => b.id === id);
    if (!b || b.upgradeEnd) return;
    if (b.level >= BUILDINGS[b.kind].maxLevel)
      return this.notify('This building is at its maximum level.');
    if (b.level >= this.maxLevel(b.kind))
      return this.notify(`Upgrade your Town Hall to raise this past level ${b.level}.`);
    if (b.kind !== 'wall' && this.busy >= this.builders)
      return this.notify('All builders are busy.');
    const d = BUILDINGS[b.kind],
      cost = this.upgradeCost(b);
    if (b.kind === 'townhall') {
      const issue = this.townHallMergeIssue(b.level);
      if (issue) return this.notify(issue);
    }
    if (this.state[d.resource] < cost)
      return this.notify(`You need ${cost.toLocaleString()} ${d.resource}.`);
    this.state[d.resource] -= cost;
    if (b.kind === 'townhall') {
      // The Town Hall 17 upgrade merges the level 7 Eagle Artillery into the Inferno Artillery.
      for (const input of townHallMergeInputs(b.level + 1)) {
        const merged = this.state.buildings.find(
          (v) => v.kind === input.kind && v.level >= input.level && !v.upgradeEnd,
        );
        if (merged) this.state.buildings = this.state.buildings.filter((v) => v !== merged);
      }
    }
    b.upgradeStart = this.clock;
    b.upgradeEnd = this.clock + this.upgradeSeconds(b) * 1000;
    this.notify(`Upgrading ${d.name} to level ${b.level + 1}.`);
    this.changed();
  }
  /** Town Hall 18: choose the Guardian that defends this village. */
  selectGuardian(kind: GuardianKind) {
    if (this.battle) return false;
    const th = this.townhall;
    if (!th || th.level < 18 || !GUARDIAN_KINDS.includes(kind)) return false;
    if (th.improving === 'guardian') {
      this.notify('Finish the Guardian upgrade before switching Guardians.');
      return false;
    }
    th.guardian = kind;
    this.notify(`${GUARDIAN_NAMES[kind]} now guards your Town Hall.`);
    this.changed();
    return true;
  }
  /** Town Hall 18: upgrade the selected Guardian with a builder (upgrade_data GuardianGeneral). */
  upgradeGuardian() {
    if (this.battle) return false;
    const th = this.townhall;
    if (!th || th.level < 18 || th.upgradeEnd || th.constructing) return false;
    const next = guardianUpgrade(th.guardian ?? 'longshot', th.guardianLevel ?? 1);
    if (!next) return false;
    if (this.busy >= this.builders) {
      this.notify('All builders are busy.');
      return false;
    }
    if (this.state[next.resource] < next.cost) {
      this.notify(`You need ${next.cost.toLocaleString()} ${next.resource}.`);
      return false;
    }
    this.state[next.resource] -= next.cost;
    th.improving = 'guardian';
    th.upgradeStart = this.clock;
    th.upgradeEnd = this.clock + next.seconds * 1000;
    this.notify(`Upgrading ${GUARDIAN_NAMES[th.guardian ?? 'longshot']} to level ${next.level}.`);
    this.changed();
    return true;
  }
  /** Supercharge a building at its maximum level with a builder (client mini levels). */
  supercharge(id: number) {
    if (this.battle) return false;
    const b = this.state.buildings.find((v) => v.id === id);
    if (!b || b.upgradeEnd || b.constructing || b.level < BUILDINGS[b.kind].maxLevel) return false;
    const quote = superchargeQuote(b.kind, b.supercharge ?? 0);
    if (!quote) return false;
    if (this.townhallLevel < quote.townhall) {
      this.notify(`Supercharges need Town Hall ${quote.townhall}.`);
      return false;
    }
    if (this.busy >= this.builders) {
      this.notify('All builders are busy.');
      return false;
    }
    if (this.state[quote.resource] < quote.cost) {
      this.notify(`You need ${quote.cost.toLocaleString()} ${quote.resource}.`);
      return false;
    }
    this.state[quote.resource] -= quote.cost;
    b.improving = 'supercharge';
    b.upgradeStart = this.clock;
    b.upgradeEnd = this.clock + quote.seconds * 1000;
    this.notify(`Supercharging ${BUILDINGS[b.kind].name} — ${formatTime(quote.seconds)}.`);
    this.changed();
    return true;
  }
  /** Town Hall 17: upgrade the Inferno Artillery weapon with a builder. */
  upgradeTownHallWeapon(id: number) {
    if (this.battle) return false;
    const b = this.state.buildings.find((v) => v.id === id);
    if (!b || b.kind !== 'townhall' || b.upgradeEnd || b.constructing) return false;
    const next = townHallWeaponUpgrade(b.level, b.weaponLevel ?? 1);
    if (!next) return false;
    if (this.busy >= this.builders) {
      this.notify('All builders are busy.');
      return false;
    }
    if (this.state[next.resource] < next.cost) {
      this.notify(`You need ${next.cost.toLocaleString()} ${next.resource}.`);
      return false;
    }
    this.state[next.resource] -= next.cost;
    b.improving = 'weapon';
    b.upgradeStart = this.clock;
    b.upgradeEnd = this.clock + next.seconds * 1000;
    this.notify(`Upgrading the Inferno Artillery to level ${next.level}.`);
    this.changed();
    return true;
  }
  finish(id: number) {
    const b = this.state.buildings.find((b) => b.id === id);
    if (!b?.upgradeEnd) return;
    const cost = this.finishCost(b);
    if (this.state.gems < cost) return this.notify('Not enough gems.');
    this.state.gems -= cost;
    b.upgradeEnd = this.clock;
    this.tick(this.clock);
    this.changed();
  }
  move(id: number) {
    if (this.battle || this.moving === id) return;
    const b = this.state.buildings.find((b) => b.id === id);
    if (!b) return;
    this.cancelNativeHandling();
    this.moving = id;
    this.placement = b.kind;
    this.selected = null;
    this.nativeBuildingHandling(b, 'pickup');
    this.changed();
  }
  private nativeBuildingHandling(b: Building, action: 'pickup' | 'place' | 'cancel') {
    if (
      !this.battle &&
      (b.kind === 'archertower' ||
        b.kind === 'darkdrill' ||
        b.kind === 'tesla' ||
        b.kind === 'bombtower' ||
        b.kind === 'seekingairmine' ||
        b.kind === 'airsweeper' ||
        b.kind === 'mortar' ||
        b.kind === 'cannon' ||
        b.kind === 'wizardtower')
    ) {
      const size = BUILDINGS[b.kind].size;
      this.onEffect({
        type: `${b.kind}-${action}`,
        sourceId: b.id,
        x: b.x + size / 2,
        y: b.y + size / 2,
      });
    }
  }
  private cancelNativeHandling() {
    const b = this.state.buildings.find((b) => b.id === this.moving);
    if (b) this.nativeBuildingHandling(b, 'cancel');
    this.endDrag(true);
  }
  cancel() {
    this.cancelNativeHandling();
    if (this.placement) this.notify('');
    this.selected = null;
    this.placement = null;
    this.moving = null;
    this.activeSpell = null;
    this.activeHero = false;
    this.changed();
  }

  // ---------------------------------------------------------------- edit mode
  private positions(): Layout['slots'] {
    return this.state.buildings.map((b) => ({
      id: b.id,
      x: b.x,
      y: b.y,
      ...(b.kind === 'airsweeper' || b.kind === 'firespitter'
        ? { direction: b.direction ?? 0 }
        : {}),
      ...(b.kind === 'skeletontrap' ? { skeletonMode: b.skeletonMode ?? 'ground' } : {}),
      ...(b.kind === 'inferno' ? { infernoMode: b.infernoMode ?? 'single' } : {}),
      ...(b.kind === 'xbow' ? { xbowMode: b.xbowMode ?? 'ground' } : {}),
      ...(b.kind === 'spelltower' ? { spellTowerWeapon: b.spellTowerWeapon ?? 'rage' } : {}),
    }));
  }
  toggleSkeletonMode() {
    if (this.battle || this.placement || this.wallMove) return false;
    const b = this.state.buildings.find((v) => v.id === this.selected);
    if (!b || b.kind !== 'skeletontrap' || b.constructing || !validSkeletonMode(b.skeletonMode))
      return false;
    if (this.editing) this.recordPositions();
    b.skeletonMode = b.skeletonMode === 'air' ? 'ground' : 'air';
    this.changed();
    return true;
  }
  toggleInfernoMode() {
    if (this.battle || this.placement || this.wallMove) return false;
    const b = this.state.buildings.find((v) => v.id === this.selected);
    if (!b || b.kind !== 'inferno' || b.constructing || !validInfernoMode(b.infernoMode))
      return false;
    if (this.editing) this.recordPositions();
    b.infernoMode = b.infernoMode === 'multi' ? 'single' : 'multi';
    this.changed();
    return true;
  }
  toggleXbowMode() {
    if (this.battle || this.placement || this.wallMove) return false;
    const b = this.state.buildings.find((v) => v.id === this.selected);
    if (!b || b.kind !== 'xbow' || b.constructing || !validXbowMode(b.xbowMode)) return false;
    if (this.editing) this.recordPositions();
    b.xbowMode = b.xbowMode === 'both' ? 'ground' : 'both';
    this.changed();
    return true;
  }
  /** Spell Tower: cycle through the spells its level has unlocked. */
  cycleSpellTowerMode() {
    if (this.battle || this.placement || this.wallMove) return false;
    const b = this.state.buildings.find((v) => v.id === this.selected);
    if (!b || b.kind !== 'spelltower' || b.constructing) return false;
    const modes = spellTowerModes(b.level);
    if (modes.length < 2) return false;
    b.spellMode = modes[(modes.indexOf(b.spellMode ?? 'rage') + 1) % modes.length];
    this.changed();
    return true;
  }
  /** Multi-Gear Tower: Long Range or Fast Attack. */
  toggleGearMode() {
    if (this.battle || this.placement || this.wallMove) return false;
    const b = this.state.buildings.find((v) => v.id === this.selected);
    if (!b || b.kind !== 'multigeartower' || b.constructing) return false;
    b.gearMode = b.gearMode === 'fast' ? 'long' : 'fast';
    this.changed();
    return true;
  }
  /** Cycles the three original Spell Tower weapons, like the X-Bow's targeting mode. */
  cycleSpellTowerWeapon() {
    if (this.battle || this.placement || this.wallMove) return false;
    const b = this.state.buildings.find((v) => v.id === this.selected);
    if (!b || b.kind !== 'spelltower' || b.constructing) return false;
    if (this.editing) this.recordPositions();
    b.spellTowerWeapon =
      SPELL_TOWER_CYCLE[
        (SPELL_TOWER_CYCLE.indexOf(b.spellTowerWeapon ?? 'rage') + 1) % SPELL_TOWER_CYCLE.length
      ];
    this.changed();
    return true;
  }
  rotateSweeper() {
    if (this.battle || this.placement || this.wallMove) return false;
    const b = this.state.buildings.find((v) => v.id === this.selected);
    if (
      !b ||
      (b.kind !== 'airsweeper' && b.kind !== 'firespitter') ||
      b.constructing ||
      !validDirection(b.direction)
    )
      return false;
    if (this.editing) this.recordPositions();
    // The Firespitter turns in 90-degree steps along tile edges (client AimRotateStep 90).
    b.direction =
      b.kind === 'firespitter'
        ? (Math.floor((b.direction ?? 0) / 2) * 2 + 2) % 8
        : ((b.direction ?? 0) + 1) % 8;
    this.changed();
    return true;
  }
  private recordPositions() {
    this.undoStack.push(this.positions());
    if (this.undoStack.length > 60) this.undoStack.shift();
    this.redoStack = [];
  }
  /**
   * Move buildings to `slots`, but only as a whole. A stored arrangement says nothing
   * about buildings raised since it was saved, so applying it blindly can stack two
   * structures on the same tiles — a corruption that survives saving and reloading.
   */
  private applyPositions(slots: Layout['slots']) {
    const moved = new Map(slots.map((s) => [s.id, s]));
    const placed = this.state.buildings.map((b) => {
      const slot = moved.get(b.id);
      return { kind: b.kind, x: slot?.x ?? b.x, y: slot?.y ?? b.y };
    });
    for (let i = 0; i < placed.length; i++) {
      const v = placed[i],
        size = BUILDINGS[v.kind].size;
      if (v.x < 0 || v.y < 0 || v.x + size > MAP_SIZE || v.y + size > MAP_SIZE) return false;
      for (let j = i + 1; j < placed.length; j++) {
        const o = placed[j];
        if (
          v.x < o.x + BUILDINGS[o.kind].size &&
          v.x + size > o.x &&
          v.y < o.y + BUILDINGS[o.kind].size &&
          v.y + size > o.y
        )
          return false;
      }
    }
    for (const [i, b] of this.state.buildings.entries()) {
      b.x = placed[i].x;
      b.y = placed[i].y;
      if (b.kind === 'airsweeper' || b.kind === 'firespitter')
        b.direction = moved.get(b.id)?.direction ?? b.direction ?? 0;
      if (b.kind === 'skeletontrap')
        b.skeletonMode = moved.get(b.id)?.skeletonMode ?? b.skeletonMode ?? 'ground';
      if (b.kind === 'inferno')
        b.infernoMode = moved.get(b.id)?.infernoMode ?? b.infernoMode ?? 'single';
      if (b.kind === 'xbow') b.xbowMode = moved.get(b.id)?.xbowMode ?? b.xbowMode ?? 'ground';
      if (b.kind === 'spelltower')
        b.spellTowerWeapon = moved.get(b.id)?.spellTowerWeapon ?? b.spellTowerWeapon ?? 'rage';
    }
    return true;
  }
  get canUndo() {
    return this.undoStack.length > 0;
  }
  /**
   * Opens one history entry for a whole drag. Without it a single drag across ten
   * tiles would take ten presses of undo to reverse.
   */
  beginDrag() {
    this.endDrag(true);
    this.dragOpen = false;
  }
  endDrag(cancelled = false) {
    const b = this.state.buildings.find((b) => b.id === this.draggedBuilding);
    this.draggedBuilding = null;
    this.dragOpen = false;
    if (b) this.nativeBuildingHandling(b, cancelled ? 'cancel' : 'place');
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }
  beginEdit() {
    if (this.battle) return;
    this.cancelNativeHandling();
    this.editing = true;
    this.dragOpen = false;
    this.selected = null;
    this.placement = null;
    this.moving = null;
    this.undoStack = [];
    this.redoStack = [];
    this.notify('Edit mode — drag any building to rearrange your village.');
    this.changed();
  }
  endEdit() {
    this.endDrag(true);
    this.wallMove = null;
    this.editing = false;
    this.undoStack = [];
    this.redoStack = [];
    this.changed();
  }
  /** Relocates a building during edit mode. Returns false when the ground is taken. */
  dragTo(id: number, x: number, y: number) {
    const b = this.state.buildings.find((v) => v.id === id);
    if (!b || !this.editing || this.battle) return false;
    if (b.x === x && b.y === y) return true;
    if (!this.canPlace(b.kind, x, y, id)) return false;
    if (!this.dragOpen) {
      this.recordPositions();
      this.dragOpen = true;
      this.draggedBuilding = b.id;
      this.nativeBuildingHandling(b, 'pickup');
    }
    b.x = x;
    b.y = y;
    this.changed();
    return true;
  }
  private layoutOverlapsObstacles(slots: Layout['slots']) {
    return slots.some((v) => {
      const b = this.state.buildings.find((b) => b.id === v.id);
      return b && overlapsObstacle(this.obstacles, v.x, v.y, BUILDINGS[b.kind].size);
    });
  }
  undo() {
    if (this.layoutOverlapsObstacles(this.undoStack.at(-1) ?? []))
      return this.notify('Clear the obstacles beneath this layout before undoing.');
    const previous = this.undoStack.pop();
    if (!previous) return this.notify('Nothing left to undo.');
    const current = this.positions();
    if (!this.applyPositions(previous)) {
      this.undoStack.push(previous);
      return this.notify('That step cannot be undone around the buildings you have added.');
    }
    this.redoStack.push(current);
    this.selected = this.selected;
    this.changed();
  }
  redo() {
    if (this.layoutOverlapsObstacles(this.redoStack.at(-1) ?? []))
      return this.notify('Clear the obstacles beneath this layout before redoing.');
    const next = this.redoStack.pop();
    if (!next) return this.notify('Nothing left to redo.');
    const current = this.positions();
    if (!this.applyPositions(next)) {
      this.redoStack.push(next);
      return this.notify('That step cannot be redone around the buildings you have added.');
    }
    this.undoStack.push(current);
    this.selected = this.selected;
    this.changed();
  }
  get layouts() {
    return this.state.layouts ?? [];
  }
  saveLayout(slot: number) {
    if (!Number.isInteger(slot) || slot < 0 || slot > 2) return;
    this.state.layouts ??= [];
    while (this.state.layouts.length < 3)
      this.state.layouts.push({
        name: `Layout ${this.state.layouts.length + 1}`,
        slots: [],
      });
    this.state.layouts[slot] = {
      name: this.state.layouts[slot].name,
      slots: this.positions(),
    };
    this.notify(`Saved to ${this.state.layouts[slot].name}.`);
    this.changed();
  }
  loadLayout(slot: number) {
    const layout = this.state.layouts?.[slot];
    if (!layout?.slots.length) return this.notify('That layout slot is still empty.');
    if (this.layoutOverlapsObstacles(layout.slots))
      return this.notify('Clear the obstacles beneath this layout before restoring it.');
    const before = this.positions();
    if (!this.applyPositions(layout.slots))
      return this.notify(
        `${layout.name} does not fit your village any more. Save it again to update it.`,
      );
    this.undoStack.push(before);
    if (this.undoStack.length > 60) this.undoStack.shift();
    this.redoStack = [];
    this.selected = this.selected;
    this.notify(`${layout.name} restored.`);
    this.changed();
  }

  // ----------------------------------------------------------------- training
  trainingTime(_kind: TroopKind) {
    return 0;
  }
  troopUnlocked(kind: TroopKind) {
    return facilityLevel(this.state.buildings, troopFacility(kind)) >= TROOP_UNLOCK[kind];
  }
  spellUnlocked(kind: SpellKind) {
    return facilityLevel(this.state.buildings, spellFactory(kind)) >= SPELL_UNLOCK[kind];
  }
  get barracksReady() {
    // Completed production facilities remain usable throughout an upgrade.
    return this.state.buildings.some((b) => b.kind === 'barracks' && !b.constructing);
  }
  get factoryReady() {
    return this.state.buildings.some((b) => b.kind === 'spellfactory' && !b.constructing);
  }
  train(kind: TroopKind, count = 1) {
    if (
      this.battle ||
      !TROOP_KEYS.includes(kind) ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > 5
    )
      return;
    if (!this.troopUnlocked(kind))
      return this.notify(
        `${TROOPS[kind].name} requires a completed level ${TROOP_UNLOCK[kind]} Barracks.`,
      );
    if (this.armySize + this.queuedSize + TROOPS[kind].space * count > this.capacity)
      return this.notify('Army camps are full. Remove troops or upgrade a camp.');
    this.state.army[kind] = (this.state.army[kind] ?? 0) + count;
    this.state.stats.trained = (this.state.stats.trained ?? 0) + count;
    this.changed();
  }
  brew(kind: SpellKind, count = 1) {
    if (
      this.battle ||
      !SPELL_KEYS.includes(kind) ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > 5
    )
      return;
    if (!this.spellUnlocked(kind))
      return this.notify(
        `${SPELLS[kind].name} requires a completed level ${SPELL_UNLOCK[kind]} ${BUILDINGS[spellFactory(kind)].name}.`,
      );
    if (
      this.spellHousing + this.queuedSpellHousing + SPELLS[kind].space * count >
      this.spellCapacity
    )
      return this.notify('Not enough spell housing. Remove a spell or upgrade the factory.');
    this.state.spells[kind] += count;
    this.changed();
  }
  removeTroop(kind: TroopKind) {
    if (this.battle || !TROOP_KEYS.includes(kind) || this.state.army[kind] <= 0) return;
    this.state.army[kind]--;
    this.changed();
  }
  removeSpell(kind: SpellKind) {
    if (this.battle || !SPELL_KEYS.includes(kind) || this.state.spells[kind] <= 0) return;
    this.state.spells[kind]--;
    this.changed();
  }
  clearArmy() {
    if (this.battle) return;
    this.state.army = emptyArmy();
    this.state.spells = emptySpells();
    this.state.queue = [];
    this.state.spellQueue = [];
    this.changed();
  }
  /** Shared validation for preparation controls and atomic composition changes. */
  armyPreparationIssue(army: Army, spells: SpellBook): string | null {
    if (this.battle) return 'Return home before preparing an army.';
    if (armySpace(army) > this.capacity || spellSpace(spells) > this.spellCapacity)
      return 'This army needs more troop or spell housing.';
    const troop = TROOP_KEYS.find((k) => army[k] > this.state.army[k] && !this.troopUnlocked(k));
    if (troop)
      return `${TROOPS[troop].name} requires a completed level ${TROOP_UNLOCK[troop]} Barracks.`;
    const spell = SPELL_KEYS.find(
      (k) => spells[k] > this.state.spells[k] && !this.spellUnlocked(k),
    );
    if (spell)
      return `${SPELLS[spell].name} requires a completed level ${SPELL_UNLOCK[spell]} ${BUILDINGS[spellFactory(spell)].name}.`;
    return null;
  }
  private prepareArmy(army: Army, spells: SpellBook) {
    const issue = this.armyPreparationIssue(army, spells);
    if (issue) {
      this.notify(issue);
      return false;
    }
    const added = TROOP_KEYS.reduce((n, k) => n + Math.max(0, army[k] - this.state.army[k]), 0);
    this.state.army = { ...army };
    this.state.spells = { ...spells };
    this.state.queue = [];
    this.state.spellQueue = [];
    this.state.stats.trained = (this.state.stats.trained ?? 0) + added;
    this.changed();
    return true;
  }
  saveArmyPreset(slot: number, name?: string) {
    if (this.battle || !Number.isInteger(slot) || slot < 0 || slot > 2) return;
    if (!this.armySize) return this.notify('Add troops before saving an army.');
    this.state.armyPresets ??= [null, null, null];
    this.state.armyPresets[slot] = {
      name: (name?.trim() || this.state.armyPresets[slot]?.name || `Army ${slot + 1}`).slice(0, 32),
      army: { ...this.state.army },
      spells: { ...this.state.spells },
    };
    this.notify('Army saved.');
    this.changed();
  }
  loadArmyPreset(slot: number) {
    const preset = this.state.armyPresets?.[slot];
    if (!preset) return this.notify('Save an army in this slot first.');
    if (this.prepareArmy(preset.army, preset.spells)) this.notify('Your army is ready.');
  }
  retrain() {
    if (!this.state.lastArmy) {
      this.notify('Complete a raid to save an army composition.');
      return false;
    }
    const army = { ...this.state.army },
      spells = { ...this.state.spells };
    for (const k of TROOP_KEYS) army[k] = Math.max(army[k], this.state.lastArmy[k]);
    for (const k of SPELL_KEYS) spells[k] = Math.max(spells[k], this.state.lastSpells?.[k] ?? 0);
    if (!this.prepareArmy(army, spells)) return false;
    this.notify('Your last army is ready.');
    return true;
  }

  // ------------------------------------------------------------------- battle
  get blacksmith() {
    return this.state.buildings.find((b) => b.kind === 'blacksmith' && !b.constructing);
  }
  get kingEquipment() {
    return this.state.equipment ?? defaultEquipment();
  }
  get ores() {
    return this.state.ores ?? emptyOres();
  }
  /** What this village's forge can hold. A village with no forge still keeps what it has. */
  get oreCapacity() {
    return oreCapacity(this.blacksmith?.level ?? 1);
  }
  get starBonus() {
    return this.state.starBonus ?? emptyStarBonus();
  }
  /** The pinned league this village's trophies fall in; its bands are contiguous. */
  get league() {
    return leagueFor(this.state.trophies);
  }
  /** Whether the daily bonus is both paid for and off cooldown. */
  get starBonusReady() {
    const bonus = this.starBonus;
    return bonus.stars >= STAR_BONUS_STARS && this.clock >= bonus.readyAt;
  }
  /** The league's own reward, clamped to the room each store has left. */
  collectStarBonus() {
    if (this.battle || !this.starBonusReady) return false;
    const reward = starBonusReward(this.state.trophies);
    const bonus = (this.state.starBonus ??= emptyStarBonus());
    const taken: Partial<Record<string, number>> = {};
    for (const k of ['gold', 'elixir', 'dark'] as const) {
      const room = Math.max(0, this.resourceCap(k) - this.state[k]);
      const amount = Math.min(reward[k], room);
      if (amount > 0) this.state[k] += amount;
      taken[k] = amount;
    }
    const ores = { ...this.ores },
      capacity = this.oreCapacity;
    for (const k of ORE_KEYS) {
      const amount = Math.min(reward[k], Math.max(0, capacity[k] - ores[k]));
      ores[k] += amount;
      taken[k] = amount;
    }
    this.state.ores = ores;
    bonus.stars -= STAR_BONUS_STARS;
    bonus.readyAt = this.clock + STAR_BONUS_COOLDOWN;
    this.state.stats.collected = (this.state.stats.collected ?? 0) + 1;
    this.notify(`${this.league.name} Star Bonus collected.`);
    this.changed();
    return taken;
  }
  /** Highest equipment level this village's forge opens; every item shares the gate. */
  get equipmentCeiling() {
    const forge = this.blacksmith?.level ?? 0;
    return forge ? EQUIPMENT_LEVELS.filter((row) => row.blacksmith <= forge).length : 0;
  }
  equipKing(kind: EquipmentKind, slot: number) {
    if (
      this.battle ||
      !this.blacksmith ||
      !this.state.king ||
      !validEquipmentKind(kind) ||
      (slot !== 0 && slot !== 1)
    )
      return false;
    const gear = structuredClone(this.kingEquipment);
    const previous = gear.loadout[slot];
    if (previous === kind) return false;
    const other = slot === 0 ? 1 : 0;
    if (gear.loadout[other] === kind) gear.loadout[other] = previous;
    gear.loadout[slot] = kind;
    this.state.equipment = gear;
    this.changed();
    return true;
  }
  /** An explicit level and gem ceiling make a stale/double-clicked confirmation harmless. */
  upgradeEquipment(kind: EquipmentKind, expectedLevel: number, maxGems = 0) {
    if (
      this.battle ||
      !this.blacksmith ||
      !validEquipmentKind(kind) ||
      !Number.isInteger(maxGems) ||
      maxGems < 0
    )
      return false;
    const gear = structuredClone(this.kingEquipment),
      level = gear.levels[kind];
    if (level !== expectedLevel || level >= EQUIPMENT_MAX_LEVEL) return false;
    if (level + 1 > this.equipmentCeiling) {
      this.notify(`Upgrade the Blacksmith to level ${equipmentBlacksmith(level + 1)} first.`);
      return false;
    }
    const quote = equipmentQuote(level + 1, this.ores)!;
    if (quote.gems > maxGems || quote.gems > this.state.gems) {
      this.notify(
        quote.gems > this.state.gems ? 'Not enough gems.' : 'More ore is needed for this upgrade.',
      );
      return false;
    }
    const ores = { ...this.ores };
    for (const k of ORE_KEYS) ores[k] -= Math.min(ores[k], quote.cost[k]);
    this.state.ores = ores;
    this.state.gems -= quote.gems;
    gear.levels[kind]++;
    this.state.equipment = gear;
    this.notify(`${EQUIPMENT[kind].name} upgraded to level ${level + 1}.`);
    this.changed();
    return true;
  }
  get heroHall() {
    return this.state.buildings.find((b) => b.kind === 'herohall' && !b.constructing);
  }
  // ------------------------------------------------------------ complete hero roster
  get heroHallLevel() {
    return this.heroHall?.level ?? 0;
  }
  get blacksmithLevel() {
    return this.blacksmith?.level ?? 0;
  }
  get petHouse() {
    return this.state.buildings.find((b) => b.kind === 'pethouse' && !b.constructing);
  }
  heroProgress(kind: HeroKind): HeroRosterProgress | undefined {
    return kind === 'king' ? this.state.king : this.state.heroes?.[kind];
  }
  /** The hero exists in this village (unlocked by its Hero Hall and Town Hall gates). */
  heroUnlocked(kind: HeroKind) {
    return (
      !!this.heroHall &&
      this.heroHallLevel >= heroUnlockHall(kind) &&
      this.townhallLevel >= heroUnlockTownHall(kind)
    );
  }
  heroLevelMax(kind: HeroKind) {
    return rosterLevelCap(kind, this.townhallLevel, this.heroHallLevel);
  }
  get heroSlotCount() {
    return this.heroHall ? heroSlots(this.heroHallLevel) : 0;
  }
  /** Gear derived from the original King equipment record until the full roster writes it. */
  get gear(): HeroGear {
    const gear = this.state.gear ?? gearFromLegacy(this.state.equipment);
    unlockCommonItems(gear, this.blacksmithLevel);
    return gear;
  }
  get petProgress(): PetProgress {
    return this.state.pets ?? { levels: {}, assigned: {} };
  }
  /** Heroes that attack, in slot order: the saved lineup, then unlocked heroes in roster order. */
  get heroLineup(): HeroKind[] {
    const ready = HERO_KINDS.filter((kind) => this.heroProgress(kind));
    const chosen = (this.state.heroLineup ?? []).filter((kind) => ready.includes(kind));
    for (const kind of ready) if (!chosen.includes(kind)) chosen.push(kind);
    return chosen.slice(0, this.heroSlotCount);
  }
  setHeroLineup(heroes: HeroKind[]) {
    if (this.battle || !heroes.every((kind) => this.heroProgress(kind))) return false;
    if (new Set(heroes).size !== heroes.length || heroes.length > this.heroSlotCount) return false;
    this.state.heroLineup = [...heroes];
    this.changed();
    return true;
  }
  private advanceHeroRoster(now: number) {
    let changed = false;
    for (const kind of HERO_KINDS) {
      if (kind === 'king' || !this.heroUnlocked(kind) || this.state.heroes?.[kind]) continue;
      (this.state.heroes ??= {})[kind] = { level: 1 };
      this.notify(`${HERO_SOURCE[kind]} has joined your village!`);
      changed = true;
    }
    for (const [kind, hero] of Object.entries(this.state.heroes ?? {}) as [
      HeroKind,
      HeroRosterProgress,
    ][]) {
      if (!hero.upgradeEnd || hero.upgradeEnd > now) continue;
      hero.level++;
      delete hero.upgradeEnd;
      delete hero.upgradeStart;
      this.notify(`${HERO_SOURCE[kind]} reached level ${hero.level}!`);
      changed = true;
    }
    const house = this.petHouse?.level ?? 0;
    if (house > 0) {
      const pets = (this.state.pets ??= { levels: {}, assigned: {} });
      for (const pet of PET_KINDS)
        if (petUnlockHouse(pet) <= house && pets.levels[pet] === undefined) {
          pets.levels[pet] = 1;
          this.notify(`${PET_DISPLAY[pet]} is ready at the Pet House!`);
          changed = true;
        }
    }
    const research = this.state.pets?.research;
    if (research && research.end <= now) {
      const pets = this.state.pets!;
      pets.levels[research.kind] = Math.min(
        petMaxLevel(research.kind),
        (pets.levels[research.kind] ?? 0) + 1,
      );
      delete pets.research;
      this.notify(`${PET_DISPLAY[research.kind]} reached level ${pets.levels[research.kind]}!`);
      changed = true;
    }
    return changed;
  }
  /** Upgrade any hero with a builder (the King keeps its original progress record). */
  upgradeRosterHero(kind: HeroKind) {
    if (kind === 'king') return this.upgradeHero();
    const hero = this.state.heroes?.[kind];
    if (this.battle || !hero || !this.heroHall || hero.upgradeEnd) return false;
    if (hero.level >= this.heroLevelMax(kind)) {
      this.notify('Upgrade your Town Hall and Hero Hall to unlock more hero levels.');
      return false;
    }
    if (this.busy >= this.builders) {
      this.notify('All builders are busy.');
      return false;
    }
    const quote = heroUpgradeQuote(kind, hero.level)!;
    if (this.state[quote.resource] < quote.cost) {
      this.notify(
        `You need ${quote.cost.toLocaleString()} ${quote.resource === 'dark' ? 'dark elixir' : quote.resource}.`,
      );
      return false;
    }
    this.state[quote.resource] -= quote.cost;
    hero.upgradeStart = this.clock;
    hero.upgradeEnd = this.clock + quote.seconds * 1000;
    this.changed();
    return true;
  }
  finishRosterHero(kind: HeroKind) {
    if (kind === 'king') return this.finishHero();
    const hero = this.state.heroes?.[kind];
    if (this.battle || !hero?.upgradeEnd) return false;
    const cost = gemCost((hero.upgradeEnd - this.clock) / 1000);
    if (this.state.gems < cost) {
      this.notify('Not enough gems.');
      return false;
    }
    this.state.gems -= cost;
    hero.upgradeEnd = this.clock;
    this.tick(this.clock);
    this.changed();
    return true;
  }
  /** Equip an owned item in one of the hero's two slots; an item in the other slot swaps. */
  equipItem(hero: HeroKind, slug: string, slot: number) {
    if (this.battle || !this.blacksmith || (slot !== 0 && slot !== 1)) return false;
    const gear = structuredClone(this.gear);
    if (!validItem(slug) || itemHero(slug) !== hero || gear.levels[slug] === undefined)
      return false;
    const loadout = [...(gear.loadouts[hero] ?? [])];
    const previous = loadout[slot];
    if (previous === slug) return false;
    const other = loadout.indexOf(slug);
    if (other >= 0) loadout[other] = previous!;
    loadout[slot] = slug;
    gear.loadouts[hero] = loadout.filter(Boolean);
    this.state.gear = gear;
    this.changed();
    return true;
  }
  /** Instant ore upgrade, gated by the Blacksmith; a confirmed gem ceiling covers missing ore. */
  upgradeItem(slug: string, expectedLevel: number, maxGems = 0) {
    if (
      this.battle ||
      !this.blacksmith ||
      !validItem(slug) ||
      !Number.isInteger(maxGems) ||
      maxGems < 0
    )
      return false;
    const gear = structuredClone(this.gear);
    const level = gear.levels[slug];
    if (level === undefined || level !== expectedLevel) return false;
    if (level >= itemLevelCap(slug, this.blacksmithLevel)) {
      this.notify('Upgrade the Blacksmith to raise this item further.');
      return false;
    }
    const cost = itemUpgradeCost(slug, level)!;
    const ores = { ...this.ores };
    const gems = ORE_KEYS.reduce(
      (sum, k) => sum + Math.max(0, cost[k] - ores[k]) * ORES[k].gems,
      0,
    );
    if (gems > maxGems || gems > this.state.gems) {
      this.notify(
        gems > this.state.gems ? 'Not enough gems.' : 'More ore is needed for this upgrade.',
      );
      return false;
    }
    for (const k of ORE_KEYS) ores[k] -= Math.min(ores[k], cost[k]);
    this.state.ores = ores;
    this.state.gems -= gems;
    gear.levels[slug] = level + 1;
    this.state.gear = gear;
    this.notify(`${itemName(slug)} upgraded to level ${level + 1}.`);
    this.changed();
    return true;
  }
  /** Epic items are sold by the Trader for gems (official wiki: 1,500 gems). */
  buyEpicItem(slug: string) {
    if (this.battle || !this.blacksmith || !validItem(slug) || itemRarity(slug) !== 'EPIC')
      return false;
    const gear = structuredClone(this.gear);
    if (gear.levels[slug] !== undefined) return false;
    if (this.state.gems < EPIC_ITEM_GEMS) {
      this.notify('Not enough gems.');
      return false;
    }
    this.state.gems -= EPIC_ITEM_GEMS;
    gear.levels[slug] = 1;
    this.state.gear = gear;
    this.notify(`${itemName(slug)} added to your Blacksmith.`);
    this.changed();
    return true;
  }
  /** One pet per hero and one hero per pet; `null` removes the hero's pet. */
  assignPet(hero: HeroKind, pet: PetKind | null) {
    if (this.battle || !this.petHouse || !this.heroProgress(hero)) return false;
    const pets = structuredClone(this.petProgress);
    if (pet !== null && pets.levels[pet] === undefined) return false;
    for (const [other, assigned] of Object.entries(pets.assigned))
      if (assigned === pet) delete pets.assigned[other as HeroKind];
    if (pet === null) delete pets.assigned[hero];
    else pets.assigned[hero] = pet;
    this.state.pets = pets;
    this.changed();
    return true;
  }
  /** Pet House upgrade: Dark Elixir, one pet at a time, no builder. */
  researchPet(kind: PetKind) {
    if (this.battle || !this.petHouse) return false;
    const pets = structuredClone(this.petProgress);
    const level = pets.levels[kind];
    if (level === undefined || pets.research) return false;
    if (level >= petLevelCap(kind, this.petHouse.level)) {
      this.notify('Upgrade the Pet House to raise this pet further.');
      return false;
    }
    const quote = petUpgradeQuote(kind, level)!;
    if (this.state[quote.resource] < quote.cost) {
      this.notify(`You need ${quote.cost.toLocaleString()} dark elixir.`);
      return false;
    }
    this.state[quote.resource] -= quote.cost;
    pets.research = { kind, start: this.clock, end: this.clock + quote.seconds * 1000 };
    this.state.pets = pets;
    this.changed();
    return true;
  }
  finishPetResearch() {
    const research = this.state.pets?.research;
    if (this.battle || !research) return false;
    const cost = gemCost((research.end - this.clock) / 1000);
    if (this.state.gems < cost) {
      this.notify('Not enough gems.');
      return false;
    }
    this.state.gems -= cost;
    research.end = this.clock;
    this.tick(this.clock);
    this.changed();
    return true;
  }
  get heroReady() {
    return this.heroLineup.some((kind) => !this.heroProgress(kind)!.upgradeEnd);
  }
  /** The battle hero entry for a kind, in version 46 battles. */
  battleHero(kind: HeroKind = this.activeHeroKind ?? 'king') {
    return this.battle?.nativeHeroes?.find((hero) => hero.kind === kind);
  }
  get heroMaxLevel() {
    return heroLevelCap(this.townhallLevel, this.heroHall?.level ?? 0);
  }
  upgradeHero() {
    const king = this.state.king;
    if (this.battle || !king || !this.heroHall || king.upgradeEnd) return false;
    if (king.level >= this.heroMaxLevel) {
      this.notify('Upgrade your Town Hall and Hero Hall to unlock more hero levels.');
      return false;
    }
    if (this.busy >= this.builders) {
      this.notify('All builders are busy.');
      return false;
    }
    const cost = heroUpgradeCost(king.level);
    if (this.state.dark < cost) {
      this.notify('Collect more dark elixir from your drills.');
      return false;
    }
    this.state.dark -= cost;
    king.upgradeStart = this.clock;
    king.upgradeEnd = this.clock + heroUpgradeSeconds(king.level) * 1000;
    this.changed();
    return true;
  }
  finishHero() {
    const king = this.state.king;
    if (this.battle || !king?.upgradeEnd) return false;
    const cost = gemCost((king.upgradeEnd - this.clock) / 1000);
    if (this.state.gems < cost) {
      this.notify('Not enough gems.');
      return false;
    }
    this.state.gems -= cost;
    king.upgradeEnd = this.clock;
    this.tick(this.clock);
    this.changed();
    return true;
  }
  /** Hero setups for a version 46 battle: lineup order, equipped items and assigned pets. */
  private heroSetups(): HeroSetup[] {
    const gear = this.gear;
    const pets = this.petProgress;
    return this.heroLineup
      .filter((kind) => {
        const hero = this.heroProgress(kind);
        return hero && !hero.upgradeEnd;
      })
      .map((kind) => {
        const items = (gear.loadouts[kind] ?? [])
          .filter((slug) => gear.levels[slug] !== undefined)
          .slice(0, 2)
          .map((slug) => ({ slug, level: gear.levels[slug] }));
        const pet = pets.assigned[kind];
        const level = pet ? pets.levels[pet] : undefined;
        return {
          kind,
          level: this.heroProgress(kind)!.level,
          items,
          ...(pet && level ? { pet: { kind: pet, level } } : {}),
        };
      });
  }
  /** Deploy one hero of the roster with its pet (version 46). */
  deployNativeHero(kind: HeroKind, x: number, y: number) {
    if (this.replay) return false;
    const b = this.battle;
    const hero = b?.nativeHeroes?.find((entry) => entry.kind === kind);
    if (!b || b.finished || !hero || hero.unitId !== null || this.deployBlocked(x, y)) return false;
    this.recordAction({ type: 'hero', hero: kind, x, y });
    this.beginFight();
    const stats = heroTroopStats(hero, b.townhall ?? this.townhallLevel);
    hero.unitId = this.state.nextId++;
    const recalled = hero.recalledHp;
    delete hero.recalledHp;
    if (recalled === undefined) recordWakeSpace(b, heroWakeSpace());
    b.units.push({
      id: hero.unitId,
      kind: heroUnitKind(kind),
      hero: kind,
      level: hero.level,
      x,
      y,
      hp: recalled ?? stats.hp,
      maxHp: stats.hp,
      cooldown: 0,
      target: null,
      path: [],
      pathAt: 0,
      attacking: false,
      spawnedAt: b.elapsed,
      native: initialNativeState(heroUnitKind(kind), hero.level),
    });
    if (hero.pet) {
      const pet = petTroopStats(hero.pet);
      const recalledPet = hero.recalledPetHp;
      delete hero.recalledPetHp;
      hero.petId = this.state.nextId++;
      b.units.push({
        id: hero.petId,
        kind: petUnitKind(hero.pet.kind),
        level: hero.pet.level,
        x: x + 0.6,
        y: y + 0.4,
        hp: recalledPet ?? pet.hp,
        maxHp: pet.hp,
        cooldown: 0,
        target: null,
        path: [],
        pathAt: 0,
        attacking: false,
        spawnedAt: b.elapsed,
        native: initialNativeState(petUnitKind(hero.pet.kind), hero.pet.level),
      });
    }
    hero.deployed = true;
    this.onEffect({ type: 'spawn', x, y });
    this.changed();
    return true;
  }
  /** One ability activation per hero and battle; a knocked-out hero fires it automatically. */
  activateNativeHeroAbility(kind: HeroKind, automatic = false) {
    if (this.replay) return false;
    const b = this.battle;
    const hero = b?.nativeHeroes?.find((entry) => entry.kind === kind);
    const unit = b?.units.find((u) => u.id === hero?.unitId);
    if (!b || b.finished || !hero || !unit || hero.abilityUsed || unit.spent) return false;
    if (!automatic && unit.hp <= 0) return false;
    if (!automatic) this.recordAction({ type: 'ability', hero: kind });
    const native = this.nativeContext(b);
    activateHero(
      {
        ...native,
        spawn: (k, level, x, y, at, owner) => spawnNativeUnit(native, k, level, x, y, at, owner),
      },
      hero,
      unit,
      b.townhall ?? this.townhallLevel,
    );
    this.changed();
    return true;
  }
  /** Legacy entry point: version 46 battles deploy the King from the roster. */
  deployHero(x: number, y: number) {
    if (this.replay) return false;
    const b = this.battle,
      h = b?.hero;
    if (b?.nativeHeroes) return this.deployNativeHero(this.activeHeroKind ?? 'king', x, y);
    if (!b || b.finished || !h || h.unitId !== null || this.deployBlocked(x, y)) return false;
    this.recordAction({ type: 'hero', x, y });
    this.beginFight();
    const stats = heroStats(h.level, h.townhall, h.equipment);
    h.unitId = this.state.nextId++;
    const recalled = h.recalledHp;
    delete h.recalledHp;
    if (recalled === undefined) recordWakeSpace(b, heroWakeSpace());
    b.units.push({
      id: h.unitId,
      kind: 'swordsman',
      hero: 'king',
      x,
      y,
      hp: recalled ?? stats.hp,
      maxHp: stats.hp,
      cooldown: 0,
      target: null,
      path: [],
      pathAt: 0,
      attacking: false,
    });
    this.onEffect({ type: 'spawn', x, y });
    this.changed();
    return true;
  }
  activateHeroAbility(automatic = false) {
    if (this.replay) return false;
    const b = this.battle,
      h = b?.hero;
    if (b?.nativeHeroes)
      return this.activateNativeHeroAbility(this.activeHeroKind ?? 'king', automatic);
    const u = b?.units.find((u) => u.id === h?.unitId);
    if (!b || b.finished || !h || !u || h.abilityUsed || u.spent || (!automatic && u.hp <= 0))
      return false;
    if (!automatic) this.recordAction({ type: 'ability' });
    h.abilityUsed = true;
    h.abilityAt = b.elapsed;
    h.summonsSpawned = 0;
    const gear = equipmentBonuses(h.equipment);
    h.rageUntil = b.elapsed + gear.duration;
    u.hp = Math.min(u.maxHp, u.hp + heroRecovery(h.level, h.townhall, h.equipment));
    startKingQuake(b, u);
    this.spawnHeroSummons();
    this.onEffect({
      type: 'trap',
      x: u.x,
      y: u.y,
      text: gear.duration ? 'RAGE VIAL!' : gear.quakeBuilding ? 'EARTHQUAKE!' : 'BARBARIAN PUPPET!',
      color: 0xffcc4d,
    });
    this.changed();
    return true;
  }
  private spawnHeroSummons() {
    const b = this.battle,
      h = b?.hero;
    if (!b || b.finished || h?.abilityAt === undefined) return;
    const u = b.units.find((unit) => unit.id === h.unitId);
    if (!u || u.hp <= 0) return;
    const due = Math.min(
      equipmentBonuses(h.equipment).summons,
      (1 + Math.floor((b.elapsed - h.abilityAt + 1e-9) / HERO_ABILITY.spawnInterval)) *
        HERO_ABILITY.spawnBatch,
    );
    while ((h.summonsSpawned ?? 0) < due) {
      const spawnedAt =
        h.abilityAt +
        Math.floor((h.summonsSpawned ?? 0) / HERO_ABILITY.spawnBatch) * HERO_ABILITY.spawnInterval;
      const stats = this.troopStats('swordsman');
      b.units.push({
        id: this.state.nextId++,
        kind: 'swordsman',
        summoned: true,
        spawnedAt,
        rageUntil: spawnedAt + HERO_ABILITY.summonDuration,
        x: u.x,
        y: u.y,
        hp: stats.hp,
        maxHp: stats.hp,
        cooldown: 0,
        target: null,
        path: [],
        pathAt: 0,
        attacking: false,
      });
      h.summonsSpawned = (h.summonsSpawned ?? 0) + 1;
      this.onEffect({ type: 'spawn', x: u.x, y: u.y });
    }
  }
  visibleBuilding(building: Building) {
    if (this.battle && building.kind === 'skeletontrap') {
      const state = this.battle.traps[building.id];
      return (
        !this.battle.finished &&
        !!state &&
        this.battle.elapsed - state.activatedAt < SKELETON_COFFIN_SECONDS
      );
    }
    return (
      !this.battle ||
      (!concealedTesla(this.battle, building) &&
        (!isTrap(building.kind) ||
          !!this.battle.traps[building.id] ||
          alwaysVisibleTrap(this.battle, building)))
    );
  }
  campaignLoot(index: number, catalog?: CampaignCatalog): CampaignResources {
    const loot =
      (catalog === 'goblin-v1'
        ? this.state.nativeCampaign?.remaining[index]
        : this.state.campaignLoot?.remaining[index]) ?? campaignStage(index, catalog);
    return campaignResources(loot, campaignAmount(campaignStage(index, catalog), 'dark') > 0);
  }
  startCampaign(index: number) {
    this.startBattle(index, false, 'goblin-v1');
  }
  startBattle(index: number, practice = false, catalog: CampaignCatalog = 'valley-v1') {
    if (this.battle) return;
    if (
      !validCampaignCatalog(catalog) ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= campaignStages(catalog).length ||
      (practice && catalog !== 'valley-v1')
    )
      return;
    if (!practice && catalog === 'goblin-v1') {
      const issues = nativeCampaignIssues(index);
      if (issues.length) return this.notify('This village is still being prepared.');
      if (!nativeUnlocked(index, this.state.nativeCampaign?.stars ?? []))
        return this.notify('Earn a star along the path to unlock this village.');
    }
    if (!practice && catalog === 'valley-v1' && index > 0 && !this.state.stars[index - 1])
      return this.notify(`Earn a star on ${CAMPAIGN[index - 1].name} to unlock this village.`);
    if (this.armySize === 0 && !this.heroReady)
      return this.notify('Prepare an army or a hero before attacking.');
    this.cancel();
    this.editing = false;
    if (!practice) {
      this.state.lastArmy = { ...this.state.army };
      this.state.lastSpells = { ...this.state.spells };
    }
    const heroes = this.heroSetups();
    const buildings = practice
      ? this.state.buildings.map((building) => ({ ...building, hp: building.maxHp, cooldown: 0 }))
      : catalog === 'goblin-v1'
        ? nativeBuildings(index)
        : enemyBase(index);
    const garrisons =
      !practice && catalog === 'goblin-v1' ? campaignGarrisonSetup(index, buildings) : undefined;
    const initial = {
      ...(garrisons ? { garrisons } : {}),
      ...(catalog === 'goblin-v1' ? { catalog, scenery: nativeScenery(index) } : {}),
      index,
      practice,
      buildings,
      army: { ...emptyArmy(), ...this.state.army },
      spells: { ...emptySpells(), ...this.state.spells },
      troopLevels: Object.fromEntries(TROOP_KEYS.map((k) => [k, this.troopLevel(k)])) as Army,
      spellLevels: Object.fromEntries(SPELL_KEYS.map((k) => [k, this.spellLevel(k)])) as SpellBook,
      nextId: this.state.nextId,
      ...(!practice
        ? {
            availableLoot: this.campaignLoot(index, catalog),
            lootRoom: {
              gold: Math.min(
                this.campaignLoot(index, catalog).gold,
                Math.max(0, Math.floor(this.resourceCap('gold') - this.state.gold)),
              ),
              elixir: Math.min(
                this.campaignLoot(index, catalog).elixir,
                Math.max(0, Math.floor(this.resourceCap('elixir') - this.state.elixir)),
              ),
              ...(this.campaignLoot(index, catalog).dark !== undefined
                ? {
                    dark: Math.min(
                      this.campaignLoot(index, catalog).dark!,
                      Math.max(0, Math.floor(this.resourceCap('dark') - this.state.dark)),
                    ),
                  }
                : {}),
            },
          }
        : {}),
      townhall: this.townhallLevel,
      ...(heroes.length ? { heroes } : {}),
    };
    this.battle = replayBattle(initial);
    this.recordingLimitReached = false;
    this.recording = this.recordBattles
      ? {
          version: REPLAY_VERSION,
          initial: structuredClone(initial),
          steps: [],
          actions: [],
        }
      : null;
    this.activeTroop = TROOP_KEYS.find((k) => this.state.army[k] > 0) ?? 'swordsman';
    this.activeSpell = null;
    this.activeHero = false;
    this.changed();
  }
  /** True where a troop may not be dropped: the red boundary the scene draws. */
  deployBlocked(x: number, y: number) {
    const b = this.battle;
    if (!b) return true;
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      x < 1 ||
      y < 1 ||
      x > MAP_SIZE - 1 ||
      y > MAP_SIZE - 1
    )
      return true;
    return b.buildings.some(
      (v) =>
        v.hp > 0 &&
        v.kind !== 'wall' &&
        !isTrap(v.kind) &&
        !concealedTesla(b, v) &&
        x > v.x - 1.5 &&
        x < v.x + BUILDINGS[v.kind].size + 1.5 &&
        y > v.y - 1.5 &&
        y < v.y + BUILDINGS[v.kind].size + 1.5,
    );
  }
  deploy(x: number, y: number) {
    if (this.replay) return false;
    if (this.activeHeroKind) return this.deployNativeHero(this.activeHeroKind, x, y);
    if (this.activeHero) return this.deployHero(x, y);
    const b = this.battle,
      k = this.activeTroop;
    if (!b || b.finished || b.remaining[k] <= 0) return false;
    if (this.deployBlocked(x, y)) {
      this.notify('Deploy on the grass outside the red boundary.');
      return false;
    }
    this.recordAction({ type: 'troop', kind: k, x, y });
    this.beginFight();
    b.remaining[k]--;
    if (!b.practice) this.state.army[k]--;
    const d = this.troopStats(k);
    const recalled = b.recalledHp?.[k]?.shift();
    if (recalled === undefined) recordWakeSpace(b, troopWakeSpace(TROOPS[k].space));
    b.units.push({
      id: this.state.nextId++,
      kind: k,
      x,
      y,
      hp: recalled ?? d.hp,
      maxHp: d.hp,
      cooldown: 0,
      target: null,
      path: [],
      pathAt: 0,
      attacking: false,
      ...(nativeBehavior(b, k) ? { native: initialNativeState(k, this.troopLevel(k)) } : {}),
    });
    this.onEffect({ type: 'spawn', x, y });
    this.changed();
    return true;
  }
  /** Drops `count` troops in a small ring, the way a drag-deploy does in Clash. */
  deployMany(x: number, y: number, count: number) {
    let placed = 0;
    for (let i = 0; i < count; i++) {
      const angle = (i / Math.max(1, count)) * Math.PI * 2;
      const radius = i === 0 ? 0 : 0.55;
      if (this.deploy(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius)) placed++;
      else if (this.deploy(x, y)) placed++;
      else break;
    }
    return placed;
  }
  castSpell(x: number, y: number) {
    if (this.replay) return false;
    const b = this.battle,
      k = this.activeSpell;
    if (!b || b.finished || !k || b.spells[k] <= 0) return false;
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      x < 0 ||
      y < 0 ||
      x > MAP_SIZE ||
      y > MAP_SIZE
    )
      return false;
    this.recordAction({ type: 'spell', kind: k, x, y });
    this.beginFight();
    recordWakeSpace(b, spellWakeSpace(SPELLS[k].space));
    b.spells[k]--;
    if (!b.practice) this.state.spells[k]--;
    const d = this.spellStats(k);
    this.onEffect({ type: 'spell', x, y, spell: k, radius: d.radius });
    if (k === 'lightning') {
      damageDefenders(b, { x, y }, d.damage, d.radius, 'both');
      lateLightningStrike(b, x, y, d.radius);
      for (const enemy of b.defenders ?? [])
        if (
          enemy.hp > 0 &&
          (enemy.kind === 'skeleton' || enemy.spawnedAt <= b.elapsed) &&
          distance2D(enemy.x - x, enemy.y - y) <= d.radius
        )
          enemy.stunnedUntil = b.elapsed + LIGHTNING_STUN;
      for (const v of b.buildings)
        if (
          v.hp > 0 &&
          !isTrap(v.kind) &&
          !concealedTesla(b, v) &&
          !['townhall', 'clancastle', 'goldstorage', 'elixirstorage', 'darkstorage'].includes(
            v.kind,
          ) &&
          distanceTo({ x, y }, v) <= d.radius
        ) {
          this.damage(v, d.damage, b.elapsed, true);
          if (v.hp > 0 && isDefense(v.kind)) {
            b.defenseStuns[v.id] = b.elapsed + LIGHTNING_STUN;
            v.cooldown = BUILDINGS[v.kind].rate!;
            delete b.defenseTargets[v.id];
          }
        }
    } else if (b.nativeRoster && !RELEASED_SPELL_KEYS.includes(k)) {
      // The spells the native roster added are cast from their client rows; the nine released
      // before it keep the implementation their own recordings were made with.
      castNativeSpell(b, SPELL_SOURCE[k], this.spellLevel(k), 'attack', x, y);
    } else if (k === 'freeze') {
      // Cold, not damage: defences stop mid-reload and defenders stop mid-step. The source
      // states a shorter `FreezeOuterTimeMS` for the edge of the burst, which needs an outer
      // radius the table does not give, so the whole radius takes the inner time.
      const until = b.elapsed + freezeSeconds(this.spellLevel('freeze'));
      for (const enemy of b.defenders ?? [])
        if (
          enemy.hp > 0 &&
          (enemy.kind === 'skeleton' || enemy.spawnedAt <= b.elapsed) &&
          distance2D(enemy.x - x, enemy.y - y) <= d.radius
        )
          enemy.stunnedUntil = Math.max(enemy.stunnedUntil ?? 0, until);
      for (const v of b.buildings)
        if (
          v.hp > 0 &&
          isDefense(v.kind) &&
          !concealedTesla(b, v) &&
          distanceTo({ x, y }, v) <= d.radius
        ) {
          b.defenseStuns[v.id] = Math.max(b.defenseStuns[v.id] ?? 0, until);
          v.cooldown = BUILDINGS[v.kind].rate!;
          delete b.defenseTargets[v.id];
        }
    } else if (k === 'clone') {
      // Copies are made in the order the originals were deployed, while the housing the
      // spell can carry lasts. A copy of a copy is not made: the source spends its housing
      // on what is really standing there.
      let room = cloneHousing(this.spellLevel('clone'));
      for (const original of b.units) {
        if (original.hp <= 0 || original.hero || original.summoned) continue;
        if (!(original.kind in b.remaining)) continue;
        if (distance2D(original.x - x, original.y - y) > d.radius) continue;
        const space = TROOPS[original.kind].space;
        if (space > room) continue;
        room -= space;
        const stats = this.troopStats(original.kind as TroopKind);
        b.units.push({
          id: this.state.nextId++,
          kind: original.kind,
          x: original.x,
          y: original.y,
          hp: stats.hp,
          maxHp: stats.hp,
          cooldown: 0,
          target: null,
          path: [],
          pathAt: 0,
          attacking: false,
          spawnedAt: b.elapsed,
          summoned: true,
          fadesAt: b.elapsed + CLONE_LIFETIME,
        });
        this.onEffect({ type: 'spawn', x: original.x, y: original.y });
      }
    } else if (k === 'recall') {
      // Troops come back into the hand, nearest the centre of the ring first, while the
      // housing the spell can carry lasts. A copy has nowhere to return to and is simply lost.
      let room = recallHousing(this.spellLevel('recall'));
      const inside = b.units
        .filter((u) => u.hp > 0 && !u.hero && distance2D(u.x - x, u.y - y) <= d.radius)
        .sort((a, c) => distance2D(a.x - x, a.y - y) - distance2D(c.x - x, c.y - y) || a.id - c.id);
      const taken = new Set<number>();
      for (const unit of inside) {
        const space = TROOPS[unit.kind].space;
        if (space > room) continue;
        room -= space;
        taken.add(unit.id);
        if (!unit.summoned && unit.kind in b.remaining) b.remaining[unit.kind as TroopKind]++;
        this.onEffect({ type: 'spawn', x: unit.x, y: unit.y });
      }
      if (taken.size) b.units = b.units.filter((u) => !taken.has(u.id));
    } else if (k === 'revive') {
      // The hero comes back where it fell, part way healed. With no hero down there is
      // nothing to revive and the spell is not spent.
      const hero = b.units.find((u) => u.hero && u.hp <= 0);
      if (!hero || distance2D(hero.x - x, hero.y - y) > d.radius) {
        b.spells[k]++;
        if (!b.practice) this.state.spells[k]++;
        this.notify('Cast the Revive Spell on a fallen hero.');
        return false;
      }
      hero.hp = Math.max(1, Math.round(hero.maxHp * reviveFraction(this.spellLevel('revive'))));
      delete hero.defeatedAt;
      delete hero.spent;
      hero.target = null;
      hero.path = [];
      hero.pathAt = 0;
      hero.attacking = false;
      this.onEffect({ type: 'spawn', x: hero.x, y: hero.y });
    } else startSpellAura(b, k as AuraSpell, x, y);
    if (b.spells[k] <= 0) this.activeSpell = SPELL_KEYS.find((s) => b.spells[s] > 0) ?? null;
    this.changed();
    return true;
  }
  /** Pure healers never keep a battle open; a Druid does, because it becomes a fighting Bear. */
  private supportOnly(b: Battle, kind: UnitKind) {
    return !!TROOPS[kind].healer && !(b.nativeRoster && kind === 'druid');
  }
  /** Version 45 roster rules share model damage, identifiers and effects with legacy combat. */
  private nativeContext(b: Battle): NativeTroopContext {
    return {
      battle: b,
      buildings: b.buildings.filter((v) => !concealedTesla(b, v)),
      damageBuilding: (target, amount, at, spell) => this.damage(target, amount, at, spell),
      effect: (fx) => this.onEffect(fx),
      nextId: () => this.state.nextId++,
      troopLevel: (kind) => this.troopLevel(kind),
      passableWalls: new Set(),
      recall: (u) => this.recallUnit(b, u),
    };
  }
  /** Recall Spell: the unit leaves the field and its card returns with the same health. */
  private recallUnit(b: Battle, u: Unit) {
    (u.native ??= {}).recalled = true;
    u.attacking = false;
    const roster = b.nativeHeroes?.find((hero) => hero.unitId === u.id);
    if (roster) {
      roster.unitId = null;
      roster.recalledHp = u.hp;
      const pet = b.units.find((other) => other.id === roster.petId);
      if (pet) {
        (pet.native ??= {}).recalled = true;
        roster.recalledPetHp = pet.hp;
        roster.petId = null;
      }
    } else if (u.hero && b.hero) {
      b.hero.unitId = null;
      b.hero.recalledHp = u.hp;
    } else if (TROOP_KEYS.includes(u.kind as TroopKind)) {
      const kind = u.kind as TroopKind;
      b.remaining[kind]++;
      if (!b.practice) this.state.army[kind]++;
      ((b.recalledHp ??= {})[kind] ??= []).push(u.hp);
    }
    this.onEffect({ type: 'spawn', x: u.x, y: u.y });
  }
  private beginFight() {
    const b = this.battle!;
    if (b.started) return;
    b.started = true;
    b.prep = 0;
  }
  step(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (this.replay) {
      this.stepReplay(dt);
      return;
    }
    const b = this.battle;
    if (!b || b.finished) return;
    // Untimed campaign scouting changes no combat state and needs no replay frames.
    if (!b.practice && !b.started) return;
    if (this.recording) {
      if (this.recording.steps.length >= MAX_REPLAY_STEPS || dt > 10 || dt < 0.000001) {
        this.recording = null;
        this.recordingLimitReached = true;
      } else this.recording.steps.push(dt);
    }
    if (!b.started) {
      // Scouting. The battle clock has not begun, but the countdown to it has.
      b.prep = Math.max(0, b.prep - dt);
      if (b.prep <= 0) {
        b.started = true;
        this.changed();
      }
      return;
    }
    // Practice has a deadline; single-player combat continues until resolved or ended.
    if (b.practice) dt = Math.min(dt, Math.max(0, BATTLE_SECONDS - b.elapsed));
    b.elapsed += dt;
    this.spawnHeroSummons();
    if (revealTeslas(b, this.onEffect)) this.changed();
    const native = b.nativeRoster ? this.nativeContext(b) : null;
    const defenses: NativeDefenseContext | null = native
      ? {
          ...native,
          defenseScale:
            b.practice || b.catalog === 'goblin-v1' ? 1 : CAMPAIGN_LAYOUTS[b.index].defense,
        }
      : null;
    stepProjectiles(
      b,
      (target, power, at) => this.damage(target, power, at),
      this.onEffect,
      native
        ? (p) => (p.defense ? resolveDefenseImpact(native, p) : resolveNativeImpact(native, p))
        : undefined,
    );
    if (native) stepNativeBattle(native);
    this.stepLate('projectiles', dt);
    stepDeathBombs(b, this.onEffect);
    stepSpellAuras(b);
    this.stepLate('auras', dt);
    stepKingQuakes(b, (target, power, at) => this.damage(target, power, at), this.onEffect);
    prepareHealerTargets(b);
    stepSweepers(b, dt, this.onEffect);
    stepGarrisonReleases(b);
    stepDefenders(b, dt, this.onEffect);
    if (native) stepGuardians(native, dt);
    if (native) stepHutBuilders(native, dt);
    // Concealed defenses cannot influence target selection or navigation.
    const gear = equipmentBonuses(b.hero?.equipment);
    const knownBuildings = b.buildings.filter(
      (v) => !concealedTesla(b, v) && !lateBuildingHidden(b, v),
    );
    // Late campaign Invisibility conceals targets, not obstacles: routes and crowd separation
    // still collide with concealed buildings. Without `late` this is the same list as before.
    const solidBuildings = b.late
      ? b.buildings.filter((v) => !concealedTesla(b, v))
      : knownBuildings;
    // A Clone Spell copy lives out its stated life and then goes, fought or not.
    for (const u of b.units)
      if (u.fadesAt !== undefined && u.hp > 0 && u.fadesAt <= b.elapsed) {
        u.hp = 0;
        u.defeatedAt = b.elapsed;
      }
    // Empty unless a Jump Spell is holding a ring open, so ordinary routing is unchanged.
    const breaches = openBreaches(b);
    if (native) native.buildings = knownBuildings;
    if (defenses) defenses.buildings = knownBuildings;
    // Jump Spells change every ground route while active; the set changes only at cast/expiry.
    const passableWalls = native ? jumpWalls(b) : undefined;
    if (native) {
      native.passableWalls = passableWalls!;
      const signature = [...passableWalls!].join(',');
      if (signature !== (b.jumpSignature ?? '')) {
        b.jumpSignature = signature;
        for (const u of b.units) if (!TROOPS[u.kind].flying) u.pathAt = 0;
      }
    }
    const routeBuildings = passableWalls?.size
      ? solidBuildings.filter((v) => !passableWalls.has(v.id))
      : solidBuildings;
    for (const u of b.units) {
      if (u.hp <= 0 || u.native?.recalled) continue;
      const unitDt = Math.min(dt, Math.max(0, b.elapsed - (u.spawnedAt ?? 0)));
      if (!unitDt) continue;
      const shrunkDt = shrinkStepTime(u, b.elapsed, unitDt);
      if (u.shrink) u.shrink.timeLost += unitDt - shrunkDt;
      if (stepAirPush(u, unitDt)) continue;
      if ((u.springUntil ?? 0) > b.elapsed) {
        u.attacking = false;
        continue;
      }
      // Frozen, stunned and ice-blocked legacy troops pause; native units resolve their own timers.
      if (native && u.native && unitFrozen(u, b.elapsed) && !nativeBehavior(b, u.kind)) {
        u.attacking = false;
        continue;
      }
      if (lateUnitHeld(b, u)) {
        u.attacking = false;
        continue;
      }
      // Late status effects scale attack timers and movement separately (Poison: 25% / 35%).
      const lateScale = lateUnitTimeScale(b, u);
      const actionDt = lateScale === 1 ? shrunkDt : shrunkDt * lateScale;
      const lateMove = lateUnitMoveScale(b, u);
      const moveDt = lateMove === 1 ? shrunkDt : shrunkDt * lateMove;
      // Garrison Headhunter poison slows movement and attack timers by separate source percentages.
      const poison = garrisonUnitScales(b, u);
      const troop = TROOPS[u.kind];
      const abilityRage =
        (u.rageUntil ?? 0) > b.elapsed || !!(u.hero && b.hero && b.hero.rageUntil > b.elapsed);
      const spellRage = (u.spellRageUntil ?? 0) > b.elapsed ? this.spellStats('rage') : null;
      const heroScale = u.hero ? RAGE_HERO_MULTIPLIER : 1;
      u.cooldown -= poison.attack === 1 ? actionDt : actionDt * poison.attack;
      u.pathAt -= unitDt;
      u.attacking = false;
      const base =
        u.hero && b.hero
          ? {
              ...this.unitStats(u),
              ...heroStats(b.hero.level, b.hero.townhall, b.hero.equipment),
            }
          : this.unitStats(u);
      const d = {
        ...base,
        heal:
          base.heal === undefined
            ? undefined
            : base.heal * (1 + (spellRage?.damageBoost ?? 0) / 100),
        damage:
          base.damage *
          Math.max(
            abilityRage ? (u.hero ? gear.damage : gear.summonDamage) : 1,
            1 + ((spellRage?.damageBoost ?? 0) / 100) * heroScale,
            u.native ? unitDamageScale(u, b.elapsed) : 1,
          ),
        // A late campaign vortex carries this attacker: it may attack in range but never moves itself.
        speed: lateUnitRooted(b, u)
          ? 0
          : (base.speed +
              Math.max(
                abilityRage ? (u.hero ? gear.speedBoost : gear.summonSpeedBoost) : 0,
                ((spellRage?.speedBoost ?? 0) / SPELL_SPEED_SCALE) * heroScale,
                u.native ? unitSpeedBonus(u, b.elapsed) : 0,
              )) *
            ((poison.move === 1 ? moveDt : moveDt * poison.move) / unitDt) *
            (u.native ? unitSpeedScale(u, b.elapsed) : 1),
      };
      if (native && nativeBehavior(b, u.kind)) {
        stepNativeUnit(native, u, d, unitDt);
        continue;
      }
      if (troop.healer) {
        stepHealer(b, u, d, unitDt, this.onEffect);
        continue;
      }
      if (
        stepAttackerVsDefenders(
          b,
          u,
          d,
          unitDt,
          solidBuildings,
          (target, power) => this.damage(target, power),
          this.onEffect,
        )
      )
        continue;
      let target = knownBuildings.find((t) => t.id === u.target && targetableBuilding(b, t));
      if (!target) {
        const alive = knownBuildings.filter((v) => v.kind !== 'wall' && targetableBuilding(b, v));
        // An Angry Spell sends its target at the defenses whatever it would ordinarily prefer.
        const angry = (u.native?.angryUntil ?? 0) > b.elapsed && !troop.healer;
        // Goblin Castle is BuildingClass Npc; active late hall weapons/hut turrets add Defense.
        const preferred =
          troop.prefersResources && !angry
            ? alive.filter((v) => isResourceBuilding(v.kind) && v.npc !== 'goblin-castle')
            : troop.prefersDefenses || angry
              ? alive.filter(
                  (v) =>
                    (activeAsDefense(b, v) && v.npc !== 'tutorial-cannon') ||
                    lateActivatedDefense(b, v),
                )
              : alive;
        target =
          (troop.wallBreaker ? breachTarget(u, knownBuildings, !!b.nativeSubtiles) : undefined) ??
          (preferred.length ? preferred : alive).sort(
            (a, c) => distanceTo(u, a) - distanceTo(u, c),
          )[0];
        if (!target) continue;
        u.target = target.id;
        u.path = [];
        u.pathAt = 0;
      }
      const distance = distanceTo(u, target);
      if (distance <= d.range) {
        u.attacking = true;
        if (u.cooldown <= 0) {
          u.cooldown = d.rate;
          if (troop.wallBreaker) {
            this.detonate(u, d.damage + (base.deathDamage ?? 0));
            continue;
          }
          const damage =
            d.damage * (troop.prefersResources && isResourceBuilding(target.kind) ? 2 : 1);
          if (u.kind === 'dragon') {
            const size = BUILDINGS[target.kind].size;
            const aim = {
              x: Math.max(target.x, Math.min(u.x, target.x + size)),
              y: Math.max(target.y, Math.min(u.y, target.y + size)),
            };
            this.damage(target, damage);
            damageDefenders(b, aim, damage, troop.splash ?? 0, 'ground');
            for (const other of b.buildings)
              if (
                other.id !== target.id &&
                other.hp > 0 &&
                !isTrap(other.kind) &&
                distanceTo(aim, other) <= (troop.splash ?? 0)
              )
                this.damage(other, damage);
            this.onEffect({
              type: 'breath',
              x: u.x,
              y: u.y,
              toX: aim.x,
              toY: aim.y,
              fromAir: true,
              sourceId: u.id,
              targetId: target.id,
              targetBuilding: true,
            });
          } else if (d.range > 2 || troop.flying) {
            launchProjectile(
              b,
              {
                weapon: troop.flying ? 'bomb' : u.kind === 'wizard' ? 'fireball' : 'arrow',
                sourceId: u.id,
                targetId: target.id,
                targetBuilding: true,
                fromX: u.x,
                fromY: u.y,
                x: target.x + BUILDINGS[target.kind].size / 2,
                y: target.y + BUILDINGS[target.kind].size / 2,
                fromAir: troop.flying,
                damage,
                splash: troop.splash,
              },
              this.onEffect,
            );
          } else {
            this.damage(target, damage);
            this.onEffect({
              type: 'hit',
              x: u.x,
              y: u.y,
              toX: target.x + BUILDINGS[target.kind].size / 2,
              toY: target.y + BUILDINGS[target.kind].size / 2,
              sourceId: u.id,
              targetId: target.id,
              targetBuilding: true,
            });
          }
        }
        continue;
      }
      if (troop.flying || troop.wallJumper) {
        // Flying and wall-jumping units move directly while retaining their target layer.
        const cx = Math.max(target.x, Math.min(u.x, target.x + BUILDINGS[target.kind].size)),
          cy = Math.max(target.y, Math.min(u.y, target.y + BUILDINGS[target.kind].size));
        const dx = cx - u.x,
          dy = cy - u.y,
          len = distance2D(dx, dy) || 1,
          move = Math.min(d.speed * unitDt, len);
        u.x += (dx / len) * move;
        u.y += (dy / len) * move;
        continue;
      }
      if (!u.path.length || u.pathAt <= 0) {
        u.path = findPath(u, target, routeBuildings, d.range, !!b.nativeSubtiles, breaches);
        u.pathAt = 1.5;
      }
      const next = u.path[0];
      if (next) {
        const wall = b.buildings.find(
          (v) =>
            v.kind === 'wall' &&
            v.hp > 0 &&
            !passableWalls?.has(v.id) &&
            Math.floor(next.x) === v.x &&
            Math.floor(next.y) === v.y,
        );
        if (wall && distanceTo(u, wall) <= d.range) {
          u.attacking = true;
          if (u.cooldown <= 0) {
            u.cooldown = d.rate;
            if (troop.wallBreaker) {
              this.detonate(u, d.damage + (base.deathDamage ?? 0));
              continue;
            }
            if (d.range > 2)
              launchProjectile(
                b,
                {
                  weapon: u.kind === 'wizard' ? 'fireball' : 'arrow',
                  sourceId: u.id,
                  targetId: wall.id,
                  targetBuilding: true,
                  fromX: u.x,
                  fromY: u.y,
                  x: wall.x + 0.5,
                  y: wall.y + 0.5,
                  damage: d.damage,
                },
                this.onEffect,
              );
            else {
              this.damage(wall, d.damage);
              this.onEffect({ type: 'hit', x: wall.x + 0.5, y: wall.y + 0.5 });
            }
          }
          continue;
        }
        if (b.nativeSubtiles) {
          // Half-tile waypoints: carry unused travel past each one, stopping before a wall.
          let travel = d.speed * unitDt;
          while (travel > 0 && u.path.length) {
            const point = u.path[0];
            const walled = b.buildings.some(
              (v) =>
                v.kind === 'wall' &&
                v.hp > 0 &&
                Math.floor(point.x) === v.x &&
                Math.floor(point.y) === v.y,
            );
            if (point !== next && walled) break;
            // Crowd separation can push a unit past a half-tile waypoint. Walking back to it
            // stalls whole crowds, so a non-wall waypoint the unit already passed along the
            // following leg is dropped while the unit stays within half a sub-tile of that leg.
            const after = u.path[1];
            if (after && !walled) {
              const lx = after.x - point.x,
                ly = after.y - point.y,
                leg = distance2D(lx, ly) || 1,
                ahead = ((u.x - point.x) * lx + (u.y - point.y) * ly) / leg,
                aside = Math.abs((u.x - point.x) * ly - (u.y - point.y) * lx) / leg;
              if (ahead > 0 && aside <= 0.25) {
                u.path.shift();
                continue;
              }
            }
            const dx = point.x - u.x,
              dy = point.y - u.y,
              len = distance2D(dx, dy);
            if (len <= travel) {
              u.x = point.x;
              u.y = point.y;
              u.path.shift();
              travel -= len;
            } else {
              u.x += (dx / len) * travel;
              u.y += (dy / len) * travel;
              travel = 0;
            }
          }
          continue;
        }
        const dx = next.x - u.x,
          dy = next.y - u.y,
          len = distance2D(dx, dy),
          move = d.speed * unitDt;
        if (len <= move) {
          u.x = next.x;
          u.y = next.y;
          u.path.shift();
        } else {
          u.x += (dx / len) * move;
          u.y += (dy / len) * move;
        }
      }
    }
    separateUnits(b.units, solidBuildings, !!b.nativeSubtiles);
    if (revealTeslas(b, this.onEffect)) this.changed();
    if (stepTraps(b, dt, this.onEffect)) this.changed();
    this.stepLate('traps', dt);
    stepMortarShells(b, this.onEffect);
    stepInfernos(b, dt);
    for (const tower of b.buildings) {
      if (defenses && nativeDefense(b, tower)) {
        stepNativeDefense(defenses, tower, dt);
        continue;
      }
      if (tower.kind === 'inferno') continue;
      const d = BUILDINGS[tower.kind];
      const canAct = b.nativeRoster
        ? tower.hp > 0 && !concealedTesla(b, tower) && !buildingImmune(b, tower)
        : targetableBuilding(b, tower);
      // Version 51: a Rage Spell Tower boosts damage; frost and chill slow the attack clock.
      const nativeBoost = b.nativeRoster ? buildingDamageScale(b, tower, b.elapsed) : 1;
      // Supercharged DPS (client mini levels) exists only in version 51 battles.
      const charged = b.nativeRoster ? superchargeBonus(tower.kind, tower.supercharge).dps : 0;
      const tempo = b.nativeRoster ? 1 / buildingAttackIntervalScale(b, tower, b.elapsed) : 1;
      if (tower.kind === 'archertower' && b.archerTowerWindups) {
        stepArcherTower(
          b,
          tower,
          dt,
          canAct && presentBuilding(b, tower),
          defenseDamage(tower.kind, tower.level) *
            (b.practice || b.catalog === 'goblin-v1' ? 1 : CAMPAIGN_LAYOUTS[b.index].defense) *
            // Defensive Rage (version 44 late campaign only; exactly one otherwise).
            (b.late ? lateDefenseBoost(b, tower).damage : 1) *
            nativeBoost,
          this.onEffect,
        );
        continue;
      }
      if (
        !d.damage ||
        !canAct ||
        !presentBuilding(b, tower) ||
        tower.constructing ||
        tower.upgradeEnd
      )
        continue;
      const activeDt =
        Math.min(dt, Math.max(0, b.elapsed - (b.defenseStuns[tower.id] ?? 0))) * tempo;
      if (activeDt <= 0) continue;
      if (tower.kind === 'xbow') {
        stepXbow(
          b,
          tower,
          activeDt,
          (defenseDamage(tower.kind, tower.level) + charged * 0.128) *
            (b.practice || b.catalog === 'goblin-v1' ? 1 : CAMPAIGN_LAYOUTS[b.index].defense) *
            (b.late ? lateDefenseBoost(b, tower).damage : 1) *
            nativeBoost,
          this.onEffect,
        );
        continue;
      }
      const cooling = tower.cooldown > 0;
      // Defensive Rage from late campaign Spell Towers; exactly one without an active cast.
      const boost = lateDefenseBoost(b, tower);
      tower.cooldown -= boost.rate === 1 ? activeDt : activeDt * boost.rate;
      if (tower.cooldown > 0) continue;
      const center = { x: tower.x + d.size / 2, y: tower.y + d.size / 2 };
      const targets = b.units.filter(
        (u) =>
          u.hp > 0 &&
          !untargetable(b, u) &&
          canTarget(d.targets, u.kind) &&
          distance2D(u.x - center.x, u.y - center.y) <= d.range! &&
          distance2D(u.x - center.x, u.y - center.y) >= (d.minRange ?? 0),
      );
      // Keep firing at the same eligible target until it dies or leaves range.
      const target =
        targets.find((u) => u.id === b.defenseTargets[tower.id]) ??
        targets.sort(
          (a, c) =>
            distance2D(a.x - center.x, a.y - center.y) - distance2D(c.x - center.x, c.y - center.y),
        )[0];
      if (target) {
        b.defenseTargets[tower.id] = target.id;
        // Carry the fraction of a frame past the deadline, so sustained fire
        // does not lose time every shot. Idle towers never accumulate a burst.
        tower.cooldown = Math.max(0, d.rate! + (cooling ? tower.cooldown : 0));
        const basePower =
          tower.npc === 'tutorial-cannon'
            ? TUTORIAL_CANNON_DAMAGE
            : (defenseDamage(tower.kind, tower.level) + charged * d.rate!) *
              (b.practice || b.catalog === 'goblin-v1' ? 1 : CAMPAIGN_LAYOUTS[b.index].defense) *
              nativeBoost;
        const power = boost.damage === 1 ? basePower : basePower * boost.damage;
        if (tower.kind === 'tesla') {
          hurtUnit(b, target, power);
          recordTeslaShot(b, tower, target);
          this.onEffect({
            type: 'tesla-zap',
            sourceId: tower.id,
            targetId: target.id,
            x: center.x,
            y: center.y,
            toX: target.x,
            toY: target.y,
            toAir: TROOPS[target.kind].flying,
          });
          continue;
        }
        if (tower.kind === 'mortar') {
          launchMortarShell(b, tower, target, power, this.onEffect);
          continue;
        }
        const projectile = launchProjectile(
          b,
          {
            fromX: center.x,
            fromY: center.y,
            x: target.x,
            y: target.y,
            damage: power,
            splash: d.splash,
            toAir: TROOPS[target.kind].flying,
            weapon:
              tower.kind === 'bombtower'
                ? 'towerbomb'
                : tower.kind === 'airdefense'
                  ? 'rocket'
                  : tower.kind === 'archertower'
                    ? 'arrow'
                    : tower.kind === 'wizardtower'
                      ? 'arcane'
                      : 'cannonball',
            ...(tower.kind === 'cannon' && !tower.npc && !b.legacyCannonFlight
              ? { variant: tower.level }
              : {}),
            ...(tower.kind === 'archertower' && b.nativeArcherTowers
              ? { variant: tower.level }
              : {}),
            ...(tower.kind === 'wizardtower'
              ? { variant: wizardTowerProjectileTier(tower.level) }
              : {}),
            sourceId: tower.id,
            targetId: target.id,
            targetBuilding: false,
          },
          this.onEffect,
        );
        if (tower.kind === 'archertower' && b.nativeArcherTowers)
          recordArcherTowerShot(b, tower, projectile);
        if (tower.kind === 'cannon' && !tower.npc) recordCannonShot(b, tower, projectile);
        if (tower.kind === 'bombtower') recordBombTowerShot(b, tower, projectile);
        if (tower.kind === 'wizardtower') recordWizardTowerShot(b, tower, projectile);
      }
    }
    this.stepLate('defenses', dt);
    if (native) stepPiercingShots(native);
    if (native && b.nativeHeroes)
      for (const hero of b.nativeHeroes) {
        const unit = b.units.find((u) => u.id === hero.unitId);
        if (!unit) continue;
        // A knocked-out hero fires its ability automatically (SimulatePlayerInputOnDeath).
        if (unit.hp <= 0 && !unit.spent && !hero.abilityUsed)
          this.activateNativeHeroAbility(hero.kind, true);
        // Waves stop when the hero falls; the automatic activation above still fires once.
        if (unit.hp > 0)
          stepHeroAbilities(
            {
              ...native,
              spawn: (k, level, x, y, at, owner) =>
                spawnNativeUnit(native, k, level, x, y, at, owner),
            },
            hero,
            unit,
            b.townhall ?? this.townhallLevel,
          );
      }
    const king = b.units.find((u) => u.hero);
    if (king && !king.spent && king.hp <= 0 && b.hero && !b.hero.abilityUsed)
      this.activateHeroAbility(true);
    for (const u of b.units) {
      if (u.hp > 0) continue;
      u.defeatedAt ??= b.elapsed;
      if (u.spent) continue;
      u.spent = true;
      if (native && nativeBehavior(b, u.kind)) {
        resolveNativeDeath(native, u);
        continue;
      }
      const troop = this.unitStats(u);
      if (!troop.deathDamage) continue;
      if (troop.wallBreaker) {
        this.detonate(u, troop.deathDamage);
        continue;
      }
      this.onEffect({
        type: 'blast',
        x: u.x,
        y: u.y,
        radius: troop.deathRadius,
      });
      for (const v of b.buildings)
        if (v.hp > 0 && distanceTo(u, v) <= (troop.deathRadius ?? 1.5))
          this.damage(v, troop.deathDamage);
      damageDefenders(b, u, troop.deathDamage, troop.deathRadius ?? 1.5);
    }
    if (native && b.units.some((u) => u.native?.recalled))
      b.units = b.units.filter((u) => !u.native?.recalled);
    this.refreshBattleScore();
    if (
      b.destruction === 100 ||
      (b.practice && b.elapsed >= BATTLE_SECONDS) ||
      (!b.shells.length &&
        !b.projectiles?.some((p) => p.weapon !== 'healing') &&
        !Object.values(b.deathBombs ?? {}).some((bomb) => !bomb.resolved && !bomb.cancelled) &&
        !lateCampaignPending(b) &&
        !b.units.some((u) => u.hp > 0 && !this.supportOnly(b, u.kind)) &&
        !b.nativeDeaths?.some((blast) => !blast.resolved) &&
        !b.nativeChains?.length &&
        !b.nativePendingSpawns?.length &&
        !b.nativeSpells?.some((cast) => nativeSpellCanStillFight(cast)) &&
        !TROOP_KEYS.some((k) => b.remaining[k] > 0 && !this.supportOnly(b, k)) &&
        !b.spells.lightning &&
        !(b.nativeRoster && FIGHTING_SPELLS.some((k) => (b.spells[k] ?? 0) > 0)) &&
        !(b.hero && b.hero.unitId === null) &&
        !b.nativeHeroes?.some((hero) => hero.unitId === null))
    )
      this.finishBattle();
  }
  /** Late campaign families run at fixed points in each simulation step. */
  private stepLate(phase: LatePhase, dt: number) {
    const battle = this.battle;
    if (!battle?.late) return;
    stepLateCampaign({
      battle,
      dt,
      phase,
      effect: this.onEffect,
      damageBuilding: (target, power, at) => this.damage(target, power, at),
    });
  }
  private refreshBattleScore() {
    const b = this.battle!;
    const structures = b.buildings.filter((v) => v.kind !== 'wall' && !isTrap(v.kind));
    const dead = structures.filter((v) => v.hp <= 0).length;
    b.destruction = structures.length ? Math.floor((dead / structures.length) * 100) : 100;
    b.stars =
      Number(b.destruction >= 50) +
      Number(structures.some((v) => v.kind === 'townhall' && v.hp <= 0)) +
      Number(b.destruction === 100);
    if (revealTeslas(b, this.onEffect)) this.changed();
    if (b.practice) {
      b.loot = { gold: 0, elixir: 0 };
      return;
    }
    // Each resource building pays out as it is damaged. Storages hold four
    // shares, collectors one, and the Town Hall two of each resource.
    const available = b.availableLoot ?? campaignResources(campaignStage(b.index, b.catalog));
    for (const resource of campaignResourceKeys(available)) {
      const storage =
        resource === 'gold'
          ? 'goldstorage'
          : resource === 'elixir'
            ? 'elixirstorage'
            : 'darkstorage';
      const weight = (v: Building) =>
        b.catalog === 'goblin-v1'
          ? Number(v.kind === 'townhall' || v.kind === storage)
          : v.kind === 'townhall'
            ? 2
            : v.kind === storage
              ? 4
              : v.kind ===
                  (resource === 'gold'
                    ? 'goldmine'
                    : resource === 'elixir'
                      ? 'collector'
                      : 'darkdrill')
                ? 1
                : 0;
      const total = structures.reduce((n, v) => n + weight(v), 0);
      const taken = total
        ? structures.reduce(
            (n, v) => n + weight(v) * (1 - Math.max(0, lateLootHitpoints(b, v)) / v.maxHp),
            0,
          ) / total
        : dead / Math.max(1, structures.length);
      const removed = Math.floor(
        campaignAmount(available, resource) * Math.min(1, Math.max(0, taken)),
      );
      b.lootTaken ??= { gold: 0, elixir: 0 };
      b.lootTaken[resource] = removed;
      b.loot[resource] = Math.min(removed, b.lootRoom?.[resource] ?? Infinity);
    }
  }
  private detonate(u: Unit, power: number) {
    u.hp = 0;
    u.spent = true;
    const radius = TROOPS[u.kind].deathRadius ?? 1.6;
    this.onEffect({ type: 'blast', x: u.x, y: u.y, radius });
    if (this.battle) damageDefenders(this.battle, u, power, radius);
    for (const building of this.battle?.buildings ?? [])
      if (building.hp > 0 && distanceTo(u, building) <= radius)
        this.damage(building, power * (building.kind === 'wall' ? 40 : 1));
  }
  damage(b: Building, n: number, at = this.battle?.elapsed ?? 0, spell = false) {
    if (b.hp <= 0 || isTrap(b.kind) || (this.battle && concealedTesla(this.battle, b))) return;
    if (this.battle?.buildingEffects && buildingImmune(this.battle, b, at)) return;
    if (this.battle?.nativeRoster && n > 0) noteBuildingDamage(this.battle, b, at, spell);
    b.hp -= n;
    if (b.hp <= 0) {
      b.hp = 0;
      if (b.kind === 'archertower' && this.battle?.nativeArcherTowers)
        (this.battle.archerTowerDestructions ??= {})[b.id] ??= {
          at,
          x: b.x + 1.5,
          y: b.y + 1.5,
          level: b.level,
        };
      if (b.kind === 'darkdrill' && this.battle?.drillDestructions)
        this.battle.drillDestructions[b.id] ??= { at, x: b.x + 1.5, y: b.y + 1.5, level: b.level };
      const tesla = b.kind === 'tesla' ? this.battle?.teslas?.[b.id] : undefined;
      if (tesla) tesla.destroyedAt = at;
      if (this.battle?.late)
        lateBuildingDestroyed(
          {
            battle: this.battle,
            dt: 0,
            phase: 'defenses',
            effect: this.onEffect,
            damageBuilding: (target, power, time) => this.damage(target, power, time),
          },
          b,
          at,
        );
      if (this.battle && b.kind === 'wizardtower') recordWizardTowerDestroyed(this.battle, b, at);
      if (this.battle && b.kind === 'airsweeper') recordSweeperDestroyed(this.battle, b, at);
      if (this.battle && b.kind === 'mortar') recordMortarDestroyed(this.battle, b, at);
      if (this.battle && b.kind === 'cannon' && !b.npc) recordCannonDestroyed(this.battle, b, at);
      if (this.battle && b.kind === 'bombtower') {
        recordBombTowerDestroyed(this.battle, b, at);
        primeDeathBomb(
          this.battle,
          b,
          bombTowerDeathDamage(b.level) *
            (this.battle.practice || this.battle.catalog === 'goblin-v1'
              ? 1
              : CAMPAIGN_LAYOUTS[this.battle.index].defense),
          at,
        );
      }
      this.onEffect({
        type: 'destroy',
        ...(b.kind === 'archertower' && this.battle?.nativeArcherTowers ? { sourceId: b.id } : {}),
        ...(b.kind === 'darkdrill' && this.battle?.drillDestructions ? { sourceId: b.id } : {}),
        ...(b.kind === 'bombtower' ? { sourceId: b.id, weapon: 'towerbomb' as const } : {}),
        ...(b.kind === 'wizardtower' ? { sourceId: b.id, weapon: 'arcane' as const } : {}),
        ...(['airsweeper', 'mortar'].includes(b.kind) || (b.kind === 'cannon' && !b.npc)
          ? { sourceId: b.id }
          : {}),
        x: b.x + BUILDINGS[b.kind].size / 2,
        y: b.y + BUILDINGS[b.kind].size / 2,
        major: b.kind === 'townhall',
      });
      for (const u of this.battle?.units ?? []) {
        u.pathAt = 0;
      }
    }
  }
  finishBattle() {
    if (this.replay) return;
    const b = this.battle;
    if (!b || b.finished) return;
    this.recordAction({ type: 'end' });
    this.refreshBattleScore();
    b.finished = true;
    b.projectiles = [];
    b.shells = [];
    for (const bomb of Object.values(b.deathBombs ?? {})) if (!bomb.resolved) bomb.cancelled = true;
    const trophies = 0;
    const overflow = (gold: number, elixir: number, dark = 0) => {
      const lost = {
        gold: Math.max(0, (b.lootTaken?.gold ?? 0) - gold),
        elixir: Math.max(0, (b.lootTaken?.elixir ?? 0) - elixir),
        ...(b.loot.dark !== undefined
          ? { dark: Math.max(0, (b.lootTaken?.dark ?? 0) - dark) }
          : {}),
      };
      return lost.gold || lost.elixir || lost.dark ? { lostLoot: lost } : {};
    };
    // A playback runner reproduces the recorded result without applying a
    // second village's storage limits or producing rewards/history of its own.
    if (!this.recordBattles) {
      b.result = {
        gold: b.loot.gold,
        elixir: b.loot.elixir,
        ...(b.loot.dark !== undefined ? { dark: b.loot.dark } : {}),
        ...overflow(b.loot.gold, b.loot.elixir, b.loot.dark),
        trophies,
        stars: b.stars,
        destruction: b.destruction,
      };
      this.changed();
      return;
    }
    const gold = b.practice
        ? 0
        : Math.max(0, Math.min(b.loot.gold, this.resourceCap('gold') - this.state.gold)),
      elixir = b.practice
        ? 0
        : Math.max(0, Math.min(b.loot.elixir, this.resourceCap('elixir') - this.state.elixir)),
      dark = b.practice
        ? 0
        : Math.max(0, Math.min(b.loot.dark ?? 0, this.resourceCap('dark') - this.state.dark));
    this.state.gold += gold;
    this.state.elixir += elixir;
    this.state.dark += dark;
    if (!b.practice) {
      if (b.catalog === 'goblin-v1') this.state.nativeCampaign ??= freshNativeCampaign();
      else this.state.campaignLoot ??= freshCampaignLoot();
      const remaining =
        b.catalog === 'goblin-v1'
          ? this.state.nativeCampaign!.remaining[b.index]
          : this.state.campaignLoot!.remaining[b.index];
      for (const k of campaignResourceKeys(b.loot))
        remaining[k] = Math.max(0, (remaining[k] ?? 0) - (b.lootTaken?.[k] ?? 0));
      const stars = b.catalog === 'goblin-v1' ? this.state.nativeCampaign!.stars : this.state.stars;
      stars[b.index] = Math.max(stars[b.index] ?? 0, b.stars);
      this.state.stats.raids++;
      this.state.stats.destroyed += b.buildings.filter(
        (v) => v.hp <= 0 && v.kind !== 'wall' && !isTrap(v.kind),
      ).length;
      this.state.xp += b.stars * 15;
      // Stars bank toward the daily bonus and are allowed to overflow past its price.
      if (b.stars > 0) {
        const bonus = (this.state.starBonus ??= emptyStarBonus());
        bonus.stars += b.stars;
      }
    }
    b.result = {
      gold,
      elixir,
      ...(b.loot.dark !== undefined ? { dark } : {}),
      ...overflow(gold, elixir, dark),
      trophies,
      stars: b.stars,
      destruction: b.destruction,
    };
    const deployed = emptyArmy(),
      spells = emptySpells();
    for (const k of TROOP_KEYS) deployed[k] = b.carriedArmy[k] - b.remaining[k];
    for (const k of SPELL_KEYS) spells[k] = b.carried[k] - b.spells[k];
    this.state.raidLog = [
      {
        id: this.state.nextId++,
        at: this.clock,
        ...(b.catalog ? { catalog: b.catalog } : {}),
        index: b.index,
        practice: b.practice,
        duration: b.elapsed,
        ...(this.recordingLimitReached ? { replayUnavailable: 'limit' as const } : {}),
        result: { ...b.result },
        ...(this.recording && validateReplay(this.recording) ? { replay: this.recording } : {}),
        deployed,
        spells,
        ...(b.hero?.unitId != null
          ? { hero: { level: b.hero.level, abilityUsed: b.hero.abilityUsed } }
          : nativeHeroRecord(b)),
      },
      ...(this.state.raidLog ?? []),
    ].slice(0, 20);
    for (const old of this.state.raidLog.slice(REPLAY_LIMIT)) delete old.replay;
    this.recording = null;
    this.changed();
  }
  /**
   * The village is about to be put away while a raid is open. Troops leave the camps the
   * moment they are deployed, so abandoning the battle unresolved would spend an army for
   * nothing: settle it at its current score instead, exactly as surrendering does.
   */
  suspendBattle() {
    const b = this.battle;
    if (!b) return;
    if (this.replay) return this.returnHome();
    const spent =
      TROOP_KEYS.some((k) => b.remaining[k] < b.carriedArmy[k]) ||
      SPELL_KEYS.some((k) => b.spells[k] < b.carried[k]) ||
      b.hero?.unitId != null;
    // Nothing was committed yet, so scouting costs the player nothing.
    if (!b.finished && spent) this.finishBattle();
    this.battle = null;
    this.recording = null;
    this.selected = null;
    this.activeSpell = null;
    this.activeHero = false;
  }
  /** Toolbox mutations are not player inputs and cannot produce faithful recordings. */
  discardRecording() {
    this.recording = null;
  }
  private recordAction(
    action:
      | Omit<Extract<ReplayAction, { type: 'troop' }>, 'step'>
      | Omit<Extract<ReplayAction, { type: 'spell' }>, 'step'>
      | { type: 'hero'; x: number; y: number; hero?: HeroKind }
      | { type: 'ability'; hero?: HeroKind }
      | { type: 'end' },
  ) {
    if (!this.recording) return;
    if (this.recording.actions.length >= MAX_REPLAY_ACTIONS) {
      this.recording = null;
      this.recordingLimitReached = true;
      return;
    }
    this.recording.actions.push({
      ...action,
      step: this.recording.steps.length,
    } as ReplayAction);
  }
  startReplay(recordId: number) {
    if (this.battle && !this.battle.finished && !this.replay) return false;
    const record = this.state.raidLog?.find((r) => r.id === recordId);
    if (
      !record?.replay ||
      !compatibleReplayVersion(record.replay.version) ||
      !validateReplay(record.replay)
    ) {
      this.notify('This attack has no compatible replay. New attacks record automatically.');
      return false;
    }
    return this.openReplay(record.replay, recordId);
  }
  /** Imported recordings are transient and never enter the home result log. */
  openReplay(data: ReplayData, recordId: number | null = null) {
    if (
      (this.battle && !this.battle.finished && !this.replay) ||
      !validateReplay(data) ||
      !compatibleReplayVersion(data.version)
    )
      return false;
    this.cancel();
    this.editing = false;
    this.recording = null;
    this.replayData = structuredClone(data);
    this.replay = {
      recordId,
      paused: false,
      speed: 1,
      time: 0,
      duration: data.steps.reduce((n, dt) => n + dt, 0),
      complete: false,
      seeking: false,
      seekTarget: 0,
    };
    this.resetReplayRunner();
    this.battle = this.replayRunner!.battle;
    this.activeHero = false;
    this.activeSpell = null;
    this.selected = null;
    this.applyReplayActions();
    this.changed();
    return true;
  }
  private resetReplayRunner() {
    const data = this.replayData!;
    const runner = new GameModel();
    runner.recordBattles = false;
    runner.state.army = { ...data.initial.army };
    runner.state.spells = { ...data.initial.spells };
    runner.state.troopLevels = { ...data.initial.troopLevels };
    runner.state.nextId = data.initial.nextId;
    runner.battle = replayBattle(data.initial, data.version);
    runner.onEffect = (fx) => {
      if (!this.replay?.seeking) this.onEffect(fx);
    };
    runner.onChange = () => {
      if (!this.replay?.seeking) this.changed();
    };
    this.replayRunner = runner;
    this.replayStep = this.replayAction = this.replayBudget = 0;
  }
  replayRecording(recordId?: number) {
    return recordId === undefined
      ? this.replayData
      : (this.state.raidLog?.find((r) => r.id === recordId)?.replay ?? null);
  }
  restartReplay() {
    if (!this.replayData || !this.replay) return false;
    return this.openReplay(this.replayData, this.replay.recordId);
  }
  /** Reconstruct silently in bounded chunks; dragging never blocks the browser for a whole raid. */
  seekReplay(seconds: number) {
    const r = this.replay;
    if (!r || !Number.isFinite(seconds)) return false;
    if (!r.seeking) this.replaySeekPaused = r.paused;
    r.seekTarget = Math.max(0, Math.min(r.duration, seconds));
    r.seeking = true;
    r.complete = false;
    r.paused = true;
    r.time = 0;
    this.resetReplayRunner();
    this.applyReplayActions();
    this.advanceReplaySeek();
    this.changed();
    return true;
  }
  private advanceReplaySeek() {
    const r = this.replay!,
      data = this.replayData!;
    let work = 0;
    const deadline = performance.now() + MAX_REPLAY_UPDATE_MS;
    // Stop on the last recorded simulation boundary at or before the requested time.
    while (
      this.replayStep < data.steps.length &&
      r.time + data.steps[this.replayStep] <= r.seekTarget + 1e-9 &&
      work < MAX_REPLAY_STEPS_PER_UPDATE &&
      (work === 0 || performance.now() < deadline)
    ) {
      work++;
      const dt = data.steps[this.replayStep++];
      r.time += dt;
      this.replayRunner!.step(dt);
      this.applyReplayActions();
    }
    if (
      this.replayStep === data.steps.length ||
      r.time + data.steps[this.replayStep] > r.seekTarget + 1e-9
    ) {
      r.seeking = false;
      r.paused = r.complete || this.replaySeekPaused;
      this.battle = this.replayRunner!.battle;
      this.changed();
    }
  }
  skipReplayScouting() {
    const data = this.replayData;
    if (!this.replay || !data) return;
    const first = data.actions.find(
      (a) => a.type === 'troop' || a.type === 'hero' || a.type === 'spell',
    );
    this.seekReplay(
      first
        ? data.steps.slice(0, first.step).reduce((n, dt) => n + dt, 0)
        : Math.min(PREP_SECONDS, this.replay.duration),
    );
  }
  toggleReplay() {
    if (!this.replay || this.replay.complete || this.replay.seeking) return;
    this.replay.paused = !this.replay.paused;
    this.changed();
  }
  setReplaySpeed(speed: number) {
    if (!this.replay || (speed !== 1 && speed !== 2 && speed !== 4)) return;
    this.replay.speed = speed;
    this.changed();
  }
  private applyReplayActions() {
    const data = this.replayData!,
      runner = this.replayRunner!;
    while (
      this.replayAction < data.actions.length &&
      data.actions[this.replayAction].step === this.replayStep
    ) {
      const a = data.actions[this.replayAction++];
      if (a.type === 'troop') {
        runner.activeTroop = a.kind;
        runner.deploy(a.x, a.y);
      } else if (a.type === 'spell') {
        runner.activeSpell = a.kind;
        runner.castSpell(a.x, a.y);
      } else if (a.type === 'hero')
        a.hero ? runner.deployNativeHero(a.hero, a.x, a.y) : runner.deployHero(a.x, a.y);
      else if (a.type === 'ability')
        a.hero ? runner.activateNativeHeroAbility(a.hero) : runner.activateHeroAbility();
      else runner.finishBattle();
    }
    if (this.replayStep === data.steps.length) {
      this.replay!.complete = true;
      this.replay!.paused = true;
      if (!this.replay!.seeking) this.changed();
    }
  }
  private stepReplay(dt: number) {
    const replay = this.replay!;
    if (replay.seeking) {
      this.advanceReplaySeek();
      return;
    }
    if (replay.paused || replay.complete) return;
    this.replayBudget += dt * replay.speed;
    const data = this.replayData!;
    let work = 0;
    const deadline = performance.now() + MAX_REPLAY_UPDATE_MS;
    while (
      this.replayStep < data.steps.length &&
      this.replayBudget + 1e-9 >= data.steps[this.replayStep] &&
      work < MAX_REPLAY_STEPS_PER_UPDATE &&
      (work === 0 || performance.now() < deadline)
    ) {
      work++;
      const delta = data.steps[this.replayStep++];
      this.replayBudget -= delta;
      replay.time += delta;
      this.replayRunner!.step(delta);
      this.applyReplayActions();
    }
  }
  returnHome() {
    this.replay = null;
    this.replayRunner = null;
    this.replayData = null;
    this.recording = null;
    this.battle = null;
    this.selected = null;
    this.activeSpell = null;
    this.activeHero = false;
    this.changed();
  }
}
export function canTarget(targets: 'ground' | 'air' | 'both' | undefined, kind: UnitKind) {
  // Totems are valid targets for ground-only and air-only defenses.
  if (kind === 'totem') return true;
  const flying = !!TROOPS[kind].flying;
  if (!targets || targets === 'both') return true;
  return targets === 'air' ? flying : !flying;
}
export function formatTime(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  if (s >= 3600) {
    const minutes = Math.round(s / 60),
      h = Math.floor(minutes / 60),
      m = minutes % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  if (s >= 60) {
    const m = Math.floor(s / 60);
    return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
  }
  return `${s}s`;
}
/**
 * Version 46 raid summary of the hero roster. The log keeps one entry, so it reports the King
 * when it fought and otherwise the first hero that was deployed.
 */
function nativeHeroRecord(b: Battle) {
  const deployed = (b.nativeHeroes ?? []).filter((hero) => hero.deployed);
  const hero = deployed.find((h) => h.kind === 'king') ?? deployed[0];
  return hero ? { hero: { level: hero.level, abilityUsed: !!hero.abilityUsed } } : {};
}
export function makeBuilding(
  id: number,
  kind: BuildingKind,
  x: number,
  y: number,
  level = 1,
): Building {
  const hp = buildingHp(kind, level);
  return {
    id,
    kind,
    x,
    y,
    level,
    hp,
    maxHp: hp,
    stored: 0,
    cooldown: 0,
  };
}
export function initialSave(): Save {
  let id = 1;
  const b: Building[] = [];
  const add = (k: BuildingKind, x: number, y: number, l = 1) =>
    b.push(makeBuilding(id++, k, x, y, l));
  add('townhall', 11, 10, 2);
  add('goldstorage', 9, 14, 2);
  add('elixirstorage', 15, 10, 2);
  add('cannon', 12, 14, 2);
  add('archertower', 15, 15, 2);
  add('barracks', 4, 15, 2);
  add('camp', 10, 21, 2);
  add('goldmine', 3, 8, 2);
  add('goldmine', 5, 4);
  add('collector', 17, 4, 2);
  add('collector', 21, 7);
  add('builder', 16, 23);
  add('builder', 21, 19);
  add('goldstorage', 6, 20);
  add('elixirstorage', 9, 4);
  add('cannon', 5, 11);
  for (let n = 8; n <= 19; n++) {
    if (n <= 12) add('wall', n, 8, 2);
    if (n !== 13 && n !== 14) add('wall', n, 19, 2);
  }
  for (let n = 9; n < 19; n++) {
    add('wall', 8, n, 2);
  }
  // The opening village has been running a while; its mines start with something to collect.
  for (const v of b) if (v.kind === 'goldmine' || v.kind === 'collector') v.stored = 1800;
  // Walls may border footprints; remove any segment occupying another building's footprint.
  const buildings = b.filter(
    (v) =>
      v.kind !== 'wall' ||
      !b.some(
        (o) =>
          o.kind !== 'wall' &&
          v.x >= o.x &&
          v.x < o.x + BUILDINGS[o.kind].size &&
          v.y >= o.y &&
          v.y < o.y + BUILDINGS[o.kind].size,
      ),
  );
  return {
    version: 4,
    dark: 0,
    // The original's own opening grant. Storage now holds the original allowance, which a
    // prototype-sized purse would overflow several times over before the first battle.
    gold: STARTING_GRANT.gold,
    elixir: STARTING_GRANT.elixir,
    gems: STARTING_GRANT.gems,
    trophies: 1248,
    xp: 1850,
    buildings,
    obstacles: initialObstacles(buildings),
    army: { ...emptyArmy(), swordsman: 12, archer: 10 },
    queue: [],
    spells: emptySpells(),
    spellQueue: [],
    stars: Array(12).fill(0),
    lastTick: Date.now(),
    nextId: id,
    tutorial: false,
    settings: { sound: true, music: false, reducedMotion: false },
    stats: { raids: 0, destroyed: 0, collected: 0 },
  };
}
export function makeNpcBuilding(
  id: number,
  npc: NpcBuildingKind,
  x: number,
  y: number,
  level = 1,
): Building {
  const d = NPC_BUILDINGS[npc];
  if (!d || !validNpcBuilding(npc, d.kind, level)) throw Error('Unsupported NPC building level');
  const b = makeBuilding(id, d.kind, x, y, level);
  return { ...b, npc, hp: d.hp[level - 1], maxHp: d.hp[level - 1] };
}
export function enemyBase(index: number) {
  return campaignBlueprint(index).map(([kind, x, y, direction, skeletonMode], i) => {
    const b = makeBuilding(
      1000 + i,
      kind,
      x,
      y,
      Math.min(BUILDINGS[kind].maxLevel, 3, 1 + Math.floor(index / 4)),
    );
    if (kind === 'airsweeper') b.direction = direction ?? 0;
    if (kind === 'skeletontrap') b.skeletonMode = skeletonMode ?? 'ground';
    b.hp *= CAMPAIGN_LAYOUTS[index].health;
    b.maxHp = b.hp;
    return b;
  });
}
export function distanceTo(u: { x: number; y: number }, b: Building | { x: number; y: number }) {
  const s = 'level' in b && b.kind in BUILDINGS ? BUILDINGS[b.kind as BuildingKind].size : 0;
  return distance2D(Math.max(b.x - u.x, 0, u.x - b.x - s), Math.max(b.y - u.y, 0, u.y - b.y - s));
}
/** Find an actual obstruction on an approach to a building, ignoring stray walls. */
export function breachTarget(u: { x: number; y: number }, buildings: Building[], subtiles = false) {
  const walls = buildings.filter((b) => b.kind === 'wall' && b.hp > 0);
  if (!walls.length) return undefined;
  const structures = buildings
    .filter((b) => b.kind !== 'wall' && !isTrap(b.kind) && b.hp > 0)
    .sort((a, b) => distanceTo(u, a) - distanceTo(u, b));
  const candidates: Building[] = [];
  for (const structure of structures.slice(0, 5)) {
    const path = findPath(u, structure, buildings, TROOPS.wallbreaker.range, subtiles);
    const obstruction = path
      .map((p) => walls.find((wall) => wall.x === Math.floor(p.x) && wall.y === Math.floor(p.y)))
      .find((wall) => wall !== undefined);
    if (obstruction) candidates.push(obstruction);
  }
  return candidates.sort((a, b) => distanceTo(u, a) - distanceTo(u, b))[0];
}
// A* on the occupancy grid. Walls carry a break-through cost, buildings are solid.
// Version-44 native campaign battles pass `subtiles` for the client's building-edge lanes.
export function findPath(
  start: { x: number; y: number },
  target: Building | { x: number; y: number },
  buildings: Building[],
  range: number,
  subtiles = false,
  /** Jump Spell rings. A wall inside one costs nothing to cross while the ring holds. */
  breaches: readonly { x: number; y: number }[] = [],
): { x: number; y: number }[] {
  if (subtiles) return findSubtilePath(start, target, buildings, range);
  const size = MAP_SIZE,
    blocked = new Uint8Array(size * size),
    wall = new Uint8Array(size * size);
  const radius = SPELLS.jump.radius;
  const breached = (x: number, y: number) =>
    breaches.some((ring) => distance2D(x + 0.5 - ring.x, y + 0.5 - ring.y) <= radius);
  for (const b of buildings) {
    if (b.hp <= 0 || isTrap(b.kind)) continue;
    for (let x = b.x; x < b.x + BUILDINGS[b.kind].size; x++)
      for (let y = b.y; y < b.y + BUILDINGS[b.kind].size; y++) {
        if (b.kind === 'wall') {
          // A breached wall is not removed, only walked over: it still stands and still
          // blocks everything outside the ring.
          if (!breaches.length || !breached(x, y)) wall[y * size + x] = 1;
        } else blocked[y * size + x] = 1;
      }
  }
  const sx = Math.max(0, Math.min(MAP_SIZE - 1, Math.floor(start.x))),
    sy = Math.max(0, Math.min(MAP_SIZE - 1, Math.floor(start.y))),
    first = sy * size + sx;
  const cost = new Float64Array(size * size).fill(Infinity),
    prev = new Int16Array(size * size).fill(-1),
    closed = new Uint8Array(size * size);
  // Stable heap preserves the old queue's first-in tie order. A decrease updates
  // the existing entry rather than making every search rescan the entire queue.
  const priority = new Float64Array(size * size),
    heuristic = new Float64Array(size * size).fill(NaN),
    order = new Uint32Array(size * size),
    position = new Int16Array(size * size).fill(-1),
    open: number[] = [];
  let sequence = 0;
  const before = (a: number, b: number) =>
    priority[a] < priority[b] || (priority[a] === priority[b] && order[a] < order[b]);
  const queue = (node: number) => {
    if (Number.isNaN(heuristic[node]))
      heuristic[node] = distanceTo(
        { x: (node % size) + 0.5, y: Math.floor(node / size) + 0.5 },
        target,
      );
    priority[node] = cost[node] + heuristic[node];
    let at = position[node];
    if (at < 0) {
      at = open.length;
      open.push(node);
      order[node] = sequence++;
    }
    while (at > 0) {
      const parent = (at - 1) >> 1;
      if (!before(node, open[parent])) break;
      open[at] = open[parent];
      position[open[at]] = at;
      at = parent;
    }
    open[at] = node;
    position[node] = at;
  };
  const take = () => {
    const node = open[0],
      last = open.pop()!;
    position[node] = -1;
    if (open.length) {
      let at = 0;
      while (at * 2 + 1 < open.length) {
        let child = at * 2 + 1;
        if (child + 1 < open.length && before(open[child + 1], open[child])) child++;
        if (!before(open[child], last)) break;
        open[at] = open[child];
        position[open[at]] = at;
        at = child;
      }
      open[at] = last;
      position[last] = at;
    }
    return node;
  };
  cost[first] = 0;
  queue(first);
  let goal = -1;
  let approach: { x: number; y: number } | undefined;
  while (open.length) {
    const current = take();
    closed[current] = 1;
    const x = current % size,
      y = Math.floor(current / size);
    if (distanceTo({ x: x + 0.5, y: y + 0.5 }, target) <= range) {
      // A grid-center goal can be in range while the unit's actual position is not.
      // Keep that final segment for buildings as well as defending troops.
      if (current === first && distanceTo(start, target) > range)
        approach = { x: x + 0.5, y: y + 0.5 };
      goal = current;
      break;
    }
    // A melee reach below half a tile cannot reach a building from grid centers.
    // Finish with a short segment inside the final cell, never through a corner
    // or an extra occupied cell. Other ranges retain their original grid route.
    if (range < 0.5 && !blocked[current]) {
      const center = { x: x + 0.5, y: y + 0.5 },
        s =
          'level' in target && target.kind in BUILDINGS
            ? BUILDINGS[target.kind as BuildingKind].size
            : 0;
      const tx = Math.max(target.x, Math.min(center.x, target.x + s));
      const ty = Math.max(target.y, Math.min(center.y, target.y + s));
      const dx = center.x - tx,
        dy = center.y - ty,
        distance = distance2D(dx, dy);
      const reach = Math.max(0, range - 1e-6); // Stay inside range despite float rounding.
      const point = { x: tx + (dx * reach) / distance, y: ty + (dy * reach) / distance };
      if (Math.floor(point.x) === x && Math.floor(point.y) === y) {
        approach = point;
        goal = current;
        break;
      }
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const n = ny * size + nx;
      if (blocked[n] || closed[n]) continue;
      const next = cost[current] + 1 + (wall[n] ? 6 : 0);
      if (next < cost[n]) {
        cost[n] = next;
        prev[n] = current;
        queue(n);
      }
    }
  }
  if (goal < 0) return [];
  const path = [];
  while (goal !== first && goal >= 0) {
    path.push({ x: (goal % size) + 0.5, y: Math.floor(goal / size) + 0.5 });
    goal = prev[goal];
  }
  path.reverse();
  if (approach) path.push(approach);
  return path;
}

/** Local, deterministic crowd separation. A sparse grid bounds neighbor work. */
export function separateUnits(units: Unit[], buildings: Building[], subtiles = false) {
  // Version-44 native campaign crowds use the same sub-tile building collision as routes.
  const lanes = subtiles ? subtileSolid(buildings) : undefined;
  const solid = new Set<number>();
  if (!lanes)
    for (const b of buildings)
      if (b.hp > 0 && !isTrap(b.kind)) {
        const size = BUILDINGS[b.kind].size;
        for (let x = b.x; x < b.x + size; x++)
          for (let y = b.y; y < b.y + size; y++) solid.add(y * MAP_SIZE + x);
      }
  const buckets = new Map<number, Unit[]>();
  const alive = units.filter((u) => u.hp > 0);
  for (const u of alive) {
    const key = Math.floor(u.y) * MAP_SIZE + Math.floor(u.x);
    const bucket = buckets.get(key) ?? [];
    bucket.push(u);
    buckets.set(key, bucket);
  }
  // Air and ground share no space, so they never push each other around.
  const free = (u: Unit, x: number, y: number) =>
    x >= 0.1 &&
    y >= 0.1 &&
    x < MAP_SIZE - 0.1 &&
    y < MAP_SIZE - 0.1 &&
    (!!TROOPS[u.kind].flying ||
      (lanes ? !lanes(x, y) : !solid.has(Math.floor(y) * MAP_SIZE + Math.floor(x))));
  for (const u of alive) {
    const cx = Math.floor(u.x),
      cy = Math.floor(u.y);
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) {
        const nx = cx + ox,
          ny = cy + oy;
        // A flat index wraps at the row edges; column 0 must not neighbour the last column.
        if (nx < 0 || nx >= MAP_SIZE || ny < 0 || ny >= MAP_SIZE) continue;
        for (const v of buckets.get(ny * MAP_SIZE + nx) ?? []) {
          if (v.id <= u.id) continue;
          if (!!TROOPS[u.kind].flying !== !!TROOPS[v.kind].flying) continue;
          const spacing = (u.kind === 'giant' ? 0.85 : 0.5) + (v.kind === 'giant' ? 0.85 : 0.5);
          const desired = spacing / 2;
          let dx = v.x - u.x,
            dy = v.y - u.y;
          let distance = distance2D(dx, dy);
          if (distance >= desired) continue;
          if (distance < 0.0001) {
            const angle = ((u.id * 127 + v.id * 31) % 628) / 100;
            dx = Math.cos(angle);
            dy = Math.sin(angle);
            distance = 1;
          }
          const push = Math.min(0.07, (desired - distance2D(v.x - u.x, v.y - u.y)) * 0.25),
            px = (dx / distance) * push,
            py = (dy / distance) * push;
          if (free(u, u.x - px, u.y - py)) {
            u.x -= px;
            u.y -= py;
          }
          if (free(v, v.x + px, v.y + py)) {
            v.x += px;
            v.y += py;
          }
        }
      }
  }
}
