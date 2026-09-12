import { distance2D } from './distance';
import {
  recordBombTowerShot,
  recordBombTowerDestroyed,
  type BombTowerAttackState,
} from './bomb-tower-attack';
import { recordTeslaShot, type TeslaAttackState } from './tesla-attack';
import { darkStorageCapacity } from './dark-storage-stats';
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
import { concealedTesla, targetableBuilding, revealTeslas } from './hidden-tesla';
import {
  defaultEquipment,
  emptyOres,
  equipmentBonuses,
  equipmentQuote,
  validEquipmentKind,
  EQUIPMENT,
  EQUIPMENT_MAX_LEVEL,
  ORE_KEYS,
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
  type AirGust,
  type SweeperState,
  type AirPush,
} from './air-sweeper';
import { isDefense } from './data';
import { campCapacity } from './camp-stats';
import { spellFactoryCapacity, facilityProgression } from './facility-progression';
import {
  MAX_SPELL_LEVEL,
  spellProgression,
  LIGHTNING_STUN,
  RAGE_HERO_MULTIPLIER,
  SPELL_SPEED_SCALE,
} from './spell-progression';
import { startSpellAura, stepSpellAuras } from './spell-effects';
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
import { TROOP_UNLOCK, SPELL_UNLOCK, facilityLevel } from './army-unlocks';
import {
  REPLAY_VERSION,
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
  expandArmyRoster,
  type ArmyPreset,
} from './army';
import { stepTraps, type TrapState } from './traps';
import {
  BUILDINGS,
  TROOPS,
  SPELLS,
  TROOP_KEYS,
  SPELL_KEYS,
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
  storageCapacity,
  buildingHp,
  upgradeCost,
  upgradeSeconds,
  type BuildingKind,
  type TroopKind,
  type SpellKind,
  type ResearchKind,
  type Resource,
} from './data';
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
  equipment?: KingEquipment;
  ores?: Ores;
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
  kind: TroopKind;
  hero?: 'king';
  summoned?: boolean;
  spawnedAt?: number;
  rageUntil?: number;
  spellRageUntil?: number;
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
  projectiles?: CombatProjectile[];
  defenseTargets: Record<number, number>;
  defenseStuns: Record<number, number>;
  traps: Record<number, TrapState>;
  gusts?: AirGust[];
  sweepers?: Record<number, SweeperState>;
  xbows?: Record<number, XbowState>;
  teslas?: Record<number, TeslaAttackState>;
  bombTowers?: Record<number, BombTowerAttackState>;
  /** Reveal time in battle seconds. Never persisted in the home village. */
  revealedTeslas?: Record<number, number>;
  deathBombs?: Record<number, DeathBomb>;
  defenders?: Defender[];
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
    | 'mortar-fire'
    | 'collect'
    | 'spawn'
    | 'upgrade'
    | 'spell'
    | 'blast'
    | 'breath'
    | 'trap'
    | 'spring'
    | 'gust'
    | 'tesla-reveal'
    | 'tesla-zap'
    | 'tesla-pickup'
    | 'tesla-place'
    | 'tesla-cancel'
    | 'bombtower-pickup'
    | 'bombtower-place'
    | 'bombtower-cancel'
    | 'seekingairmine-pickup'
    | 'seekingairmine-place'
    | 'seekingairmine-cancel'
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
  maxCount(kind: BuildingKind) {
    return maxCountFor(kind, this.townhallLevel);
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
    return spellFactoryCapacity(facilityLevel(this.state.buildings, 'spellfactory'));
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
    return SPELL_KEYS.reduce((n, k) => n + this.state.spells[k], 0);
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
    if (this.researchLevel(kind) >= (spell ? MAX_SPELL_LEVEL : maxTroopLevel(kind)))
      return this.notify(`This ${spell ? 'spell' : 'troop'} is at its maximum level.`);
    const requiredLab = this.researchLaboratory(kind);
    if (lab.level < requiredLab)
      return this.notify(`Upgrade your laboratory to level ${requiredLab}.`);
    const cost = this.researchCost(kind);
    if (this.state.elixir < cost) return this.notify('Not enough elixir.');
    this.state.elixir -= cost;
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
  get league() {
    return this.state.trophies >= 1800
      ? 'Gold League I'
      : this.state.trophies >= 1000
        ? 'Silver League II'
        : 'Bronze League I';
  }
  get builders() {
    return this.state.buildings.filter((b) => b.kind === 'builder' && !b.constructing).length;
  }
  /** Timed builder reservations. Walls require a free builder but finish immediately. */
  get busy() {
    return (
      this.state.buildings.filter((b) => b.upgradeEnd && b.kind !== 'wall').length +
      Number(!!this.state.king?.upgradeEnd)
    );
  }
  resourceCap(kind: Resource) {
    if (kind === 'dark')
      return this.state.buildings
        .filter((b) => b.kind === 'darkstorage' && !b.constructing)
        .reduce((n, b) => n + darkStorageCapacity(b.level), 0);
    return (
      100000 +
      this.state.buildings
        .filter(
          (b) => b.kind === (kind === 'gold' ? 'goldstorage' : 'elixirstorage') && !b.constructing,
        )
        .reduce((n, b) => n + storageCapacity(b.level), 0)
    );
  }
  tick(now: number) {
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
    const dt = Math.max(0, Math.min(now - this.state.lastTick, 8 * 3600000)) / 1000;
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
            'camp',
            'darkstorage',
          ].includes(b.kind)) &&
        b.maxHp !== buildingHp(b.kind, b.level)
      ) {
        const hp = buildingHp(b.kind, b.level);
        b.hp = b.maxHp > 0 ? Math.min(1, b.hp / b.maxHp) * hp : hp;
        b.maxHp = hp;
        structural = changed = true;
      }
      const productionSeconds = b.upgradeEnd
        ? Math.max(0, Math.min(dt, (now - b.upgradeEnd) / 1000))
        : dt;
      if (b.upgradeEnd && b.upgradeEnd <= now) {
        if (!b.constructing) b.level++;
        b.constructing = false;
        b.upgradeEnd = undefined;
        b.upgradeStart = undefined;
        b.maxHp = buildingHp(b.kind, b.level);
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
        b.stored = Math.min(
          (b.kind === 'darkdrill' ? 2000 : 10000) * b.level,
          b.stored + productionSeconds * (b.kind === 'darkdrill' ? 0.1 : 3) * b.level,
        );
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
        this.state.spellLevels ??= { lightning: 1, heal: 1, rage: 1 };
        level = this.state.spellLevels[kind] = Math.min(
          MAX_SPELL_LEVEL,
          this.state.spellLevels[kind] + 1,
        );
        name = SPELLS[kind].name;
      } else {
        this.state.troopLevels ??= {
          swordsman: 1,
          archer: 1,
          giant: 1,
          wizard: 1,
          balloon: 1,
          goblin: 1,
          wallbreaker: 1,
          healer: 1,
          dragon: 1,
          pekka: 1,
        };
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
    const limit = this.maxCount(kind);
    if (limit === 0)
      return this.notify(`Upgrade your Town Hall to unlock the ${d.name.toLowerCase()}.`);
    if (this.countOf(kind) >= limit)
      return this.notify(
        d.available.some((count) => count > limit)
          ? `Town Hall ${this.townhallLevel} allows ${limit} ${d.name.toLowerCase()}. Upgrade it for more.`
          : `Your village already has its maximum number of ${d.name.toLowerCase()}.`,
      );
    if (this.state[d.resource] < d.cost) return this.notify(`Not enough ${d.resource}.`);
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
    if (
      this.state[d.resource] < d.cost ||
      this.countOf(kind) >= this.maxCount(kind) ||
      (!isTrap(kind) && this.busy >= this.builders)
    ) {
      this.notify('Unable to build. Check your resources and builders.');
      return false;
    }
    this.state[d.resource] -= d.cost;
    const b = makeBuilding(this.state.nextId++, kind, x, y, 1);
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
    if (this.state[d.resource] < cost)
      return this.notify(`You need ${cost.toLocaleString()} ${d.resource}.`);
    this.state[d.resource] -= cost;
    b.upgradeStart = this.clock;
    b.upgradeEnd = this.clock + this.upgradeSeconds(b) * 1000;
    this.notify(`Upgrading ${d.name} to level ${b.level + 1}.`);
    this.changed();
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
      (b.kind === 'tesla' || b.kind === 'bombtower' || b.kind === 'seekingairmine')
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
      ...(b.kind === 'airsweeper' ? { direction: b.direction ?? 0 } : {}),
      ...(b.kind === 'skeletontrap' ? { skeletonMode: b.skeletonMode ?? 'ground' } : {}),
      ...(b.kind === 'xbow' ? { xbowMode: b.xbowMode ?? 'ground' } : {}),
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
  toggleXbowMode() {
    if (this.battle || this.placement || this.wallMove) return false;
    const b = this.state.buildings.find((v) => v.id === this.selected);
    if (!b || b.kind !== 'xbow' || b.constructing || !validXbowMode(b.xbowMode)) return false;
    if (this.editing) this.recordPositions();
    b.xbowMode = b.xbowMode === 'both' ? 'ground' : 'both';
    this.changed();
    return true;
  }
  rotateSweeper() {
    if (this.battle || this.placement || this.wallMove) return false;
    const b = this.state.buildings.find((v) => v.id === this.selected);
    if (!b || b.kind !== 'airsweeper' || b.constructing || !validDirection(b.direction))
      return false;
    if (this.editing) this.recordPositions();
    b.direction = ((b.direction ?? 0) + 1) % 8;
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
      if (b.kind === 'airsweeper') b.direction = moved.get(b.id)?.direction ?? b.direction ?? 0;
      if (b.kind === 'skeletontrap')
        b.skeletonMode = moved.get(b.id)?.skeletonMode ?? b.skeletonMode ?? 'ground';
      if (b.kind === 'xbow') b.xbowMode = moved.get(b.id)?.xbowMode ?? b.xbowMode ?? 'ground';
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
    return facilityLevel(this.state.buildings, 'barracks') >= TROOP_UNLOCK[kind];
  }
  spellUnlocked(kind: SpellKind) {
    return facilityLevel(this.state.buildings, 'spellfactory') >= SPELL_UNLOCK[kind];
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
    this.state.army[kind] += count;
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
        `${SPELLS[kind].name} requires a completed level ${SPELL_UNLOCK[kind]} Spell Factory.`,
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
      return `${SPELLS[spell].name} requires a completed level ${SPELL_UNLOCK[spell]} Spell Factory.`;
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
  get heroReady() {
    return !!this.state.king && !!this.heroHall && !this.state.king.upgradeEnd;
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
  deployHero(x: number, y: number) {
    if (this.replay) return false;
    const b = this.battle,
      h = b?.hero;
    if (!b || b.finished || !h || h.unitId !== null || this.deployBlocked(x, y)) return false;
    this.recordAction({ type: 'hero', x, y });
    this.beginFight();
    const stats = heroStats(h.level, h.townhall, h.equipment);
    h.unitId = this.state.nextId++;
    b.units.push({
      id: h.unitId,
      kind: 'swordsman',
      hero: 'king',
      x,
      y,
      hp: stats.hp,
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
        (!isTrap(building.kind) || !!this.battle.traps[building.id]))
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
    const initial = {
      ...(catalog === 'goblin-v1' ? { catalog, scenery: nativeScenery(index) } : {}),
      index,
      practice,
      buildings: practice
        ? this.state.buildings.map((building) => ({
            ...building,
            hp: building.maxHp,
            cooldown: 0,
          }))
        : catalog === 'goblin-v1'
          ? nativeBuildings(index)
          : enemyBase(index),
      army: { ...this.state.army },
      spells: { ...this.state.spells },
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
      hero: this.heroReady
        ? {
            level: this.state.king!.level,
            townhall: this.townhallLevel,
            equipment: structuredClone(this.kingEquipment),
          }
        : undefined,
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
    b.units.push({
      id: this.state.nextId++,
      kind: k,
      x,
      y,
      hp: d.hp,
      maxHp: d.hp,
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
    b.spells[k]--;
    if (!b.practice) this.state.spells[k]--;
    const d = this.spellStats(k);
    this.onEffect({ type: 'spell', x, y, spell: k, radius: d.radius });
    if (k === 'lightning') {
      damageDefenders(b, { x, y }, d.damage, d.radius, 'both');
      for (const enemy of b.defenders ?? [])
        if (enemy.hp > 0 && distance2D(enemy.x - x, enemy.y - y) <= d.radius)
          enemy.stunnedUntil = b.elapsed + LIGHTNING_STUN;
      for (const v of b.buildings)
        if (
          v.hp > 0 &&
          !isTrap(v.kind) &&
          !concealedTesla(b, v) &&
          !['townhall', 'goldstorage', 'elixirstorage', 'darkstorage'].includes(v.kind) &&
          distanceTo({ x, y }, v) <= d.radius
        ) {
          this.damage(v, d.damage);
          if (v.hp > 0 && isDefense(v.kind)) {
            b.defenseStuns[v.id] = b.elapsed + LIGHTNING_STUN;
            v.cooldown = BUILDINGS[v.kind].rate!;
            delete b.defenseTargets[v.id];
          }
        }
    } else startSpellAura(b, k, x, y);
    if (b.spells[k] <= 0) this.activeSpell = SPELL_KEYS.find((s) => b.spells[s] > 0) ?? null;
    this.changed();
    return true;
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
    stepProjectiles(b, (target, power, at) => this.damage(target, power, at), this.onEffect);
    stepDeathBombs(b, this.onEffect);
    stepSpellAuras(b);
    stepKingQuakes(b, (target, power, at) => this.damage(target, power, at), this.onEffect);
    prepareHealerTargets(b);
    stepSweepers(b, dt, this.onEffect);
    stepDefenders(b, dt, this.onEffect);
    // Concealed defenses cannot influence target selection or navigation.
    const gear = equipmentBonuses(b.hero?.equipment);
    const knownBuildings = b.buildings.filter((v) => !concealedTesla(b, v));
    for (const u of b.units) {
      if (u.hp <= 0) continue;
      const unitDt = Math.min(dt, Math.max(0, b.elapsed - (u.spawnedAt ?? 0)));
      if (!unitDt) continue;
      if (stepAirPush(u, unitDt)) continue;
      if ((u.springUntil ?? 0) > b.elapsed) {
        u.attacking = false;
        continue;
      }
      const troop = TROOPS[u.kind];
      const abilityRage =
        (u.rageUntil ?? 0) > b.elapsed || !!(u.hero && b.hero && b.hero.rageUntil > b.elapsed);
      const spellRage = (u.spellRageUntil ?? 0) > b.elapsed ? this.spellStats('rage') : null;
      const heroScale = u.hero ? RAGE_HERO_MULTIPLIER : 1;
      u.cooldown -= unitDt;
      u.pathAt -= unitDt;
      u.attacking = false;
      const base =
        u.hero && b.hero
          ? {
              ...this.troopStats(u.kind),
              ...heroStats(b.hero.level, b.hero.townhall, b.hero.equipment),
            }
          : this.troopStats(u.kind);
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
          ),
        speed:
          base.speed +
          Math.max(
            abilityRage ? (u.hero ? gear.speedBoost : gear.summonSpeedBoost) : 0,
            ((spellRage?.speedBoost ?? 0) / SPELL_SPEED_SCALE) * heroScale,
          ),
      };
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
          knownBuildings,
          (target, power) => this.damage(target, power),
          this.onEffect,
        )
      )
        continue;
      let target = knownBuildings.find((t) => t.id === u.target && targetableBuilding(b, t));
      if (!target) {
        const alive = knownBuildings.filter((v) => v.kind !== 'wall' && targetableBuilding(b, v));
        const preferred = troop.prefersResources
          ? alive.filter((v) => isResourceBuilding(v.kind))
          : troop.prefersDefenses
            ? alive.filter((v) => isDefense(v.kind) && v.npc !== 'tutorial-cannon')
            : alive;
        target =
          (troop.wallBreaker ? breachTarget(u, knownBuildings) : undefined) ??
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
      if (troop.flying) {
        // Air troops ignore walls, buildings and the navigation grid entirely.
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
        u.path = findPath(u, target, knownBuildings, d.range);
        u.pathAt = 1.5;
      }
      const next = u.path[0];
      if (next) {
        const wall = b.buildings.find(
          (v) =>
            v.kind === 'wall' &&
            v.hp > 0 &&
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
    separateUnits(b.units, knownBuildings);
    if (revealTeslas(b, this.onEffect)) this.changed();
    if (stepTraps(b, dt, this.onEffect)) this.changed();
    // Shells land where the target stood when fired. Air units and troops that
    // have escaped the impact circle take no damage, even if they were targeted.
    for (const shell of b.shells) {
      if (shell.impact > b.elapsed + 1e-9) continue;
      for (const u of b.units)
        if (
          u.hp > 0 &&
          !TROOPS[u.kind].flying &&
          (u.spawnedAt ?? 0) <= shell.impact + 1e-9 &&
          distance2D(u.x - shell.x, u.y - shell.y) <= shell.radius
        )
          u.hp -= shell.damage;
      this.onEffect({
        type: 'blast',
        x: shell.x,
        y: shell.y,
        radius: shell.radius,
        weapon: 'cannonball',
      });
    }
    b.shells = b.shells.filter((shell) => shell.impact > b.elapsed + 1e-9);
    for (const tower of b.buildings) {
      const d = BUILDINGS[tower.kind];
      if (!d.damage || !targetableBuilding(b, tower) || tower.constructing || tower.upgradeEnd)
        continue;
      const activeDt = Math.min(dt, Math.max(0, b.elapsed - (b.defenseStuns[tower.id] ?? 0)));
      if (activeDt <= 0) continue;
      if (tower.kind === 'xbow') {
        stepXbow(
          b,
          tower,
          activeDt,
          defenseDamage(tower.kind, tower.level) *
            (b.practice || b.catalog === 'goblin-v1' ? 1 : CAMPAIGN_LAYOUTS[b.index].defense),
          this.onEffect,
        );
        continue;
      }
      const cooling = tower.cooldown > 0;
      tower.cooldown -= activeDt;
      if (tower.cooldown > 0) continue;
      const center = { x: tower.x + d.size / 2, y: tower.y + d.size / 2 };
      const targets = b.units.filter(
        (u) =>
          u.hp > 0 &&
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
        const power =
          tower.npc === 'tutorial-cannon'
            ? TUTORIAL_CANNON_DAMAGE
            : defenseDamage(tower.kind, tower.level) *
              (b.practice || b.catalog === 'goblin-v1' ? 1 : CAMPAIGN_LAYOUTS[b.index].defense);
        if (tower.kind === 'tesla') {
          target.hp -= power;
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
          b.shells.push({
            sourceId: tower.id,
            fromX: center.x,
            fromY: center.y,
            x: target.x,
            y: target.y,
            launched: b.elapsed,
            impact: b.elapsed + 1.15,
            damage: power,
            radius: d.splash!,
          });
          this.onEffect({ type: 'mortar-fire', sourceId: tower.id, x: center.x, y: center.y });
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
            ...(tower.kind === 'wizardtower'
              ? { variant: wizardTowerProjectileTier(tower.level) }
              : {}),
            sourceId: tower.id,
            targetId: target.id,
            targetBuilding: false,
          },
          this.onEffect,
        );
        if (tower.kind === 'bombtower') recordBombTowerShot(b, tower, projectile);
      }
    }
    const king = b.units.find((u) => u.hero);
    if (king && !king.spent && king.hp <= 0 && b.hero && !b.hero.abilityUsed)
      this.activateHeroAbility(true);
    for (const u of b.units) {
      if (u.hp > 0) continue;
      u.defeatedAt ??= b.elapsed;
      if (u.spent) continue;
      u.spent = true;
      const troop = this.troopStats(u.kind);
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
    this.refreshBattleScore();
    if (
      b.destruction === 100 ||
      (b.practice && b.elapsed >= BATTLE_SECONDS) ||
      (!b.shells.length &&
        !b.projectiles?.some((p) => p.weapon !== 'healing') &&
        !Object.values(b.deathBombs ?? {}).some((bomb) => !bomb.resolved && !bomb.cancelled) &&
        !b.units.some((u) => u.hp > 0 && !TROOPS[u.kind].healer) &&
        !TROOP_KEYS.some((k) => b.remaining[k] > 0 && !TROOPS[k].healer) &&
        !b.spells.lightning &&
        !(b.hero && b.hero.unitId === null))
    )
      this.finishBattle();
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
        ? structures.reduce((n, v) => n + weight(v) * (1 - Math.max(0, v.hp) / v.maxHp), 0) / total
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
  damage(b: Building, n: number, at = this.battle?.elapsed ?? 0) {
    if (b.hp <= 0 || isTrap(b.kind) || (this.battle && concealedTesla(this.battle, b))) return;
    b.hp -= n;
    if (b.hp <= 0) {
      b.hp = 0;
      const tesla = b.kind === 'tesla' ? this.battle?.teslas?.[b.id] : undefined;
      if (tesla) tesla.destroyedAt = at;
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
        ...(b.kind === 'bombtower' ? { sourceId: b.id, weapon: 'towerbomb' as const } : {}),
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
          : {}),
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
      | { type: 'hero'; x: number; y: number }
      | { type: 'ability' | 'end' },
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
      record.replay.version !== REPLAY_VERSION ||
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
      data.version !== REPLAY_VERSION
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
    runner.battle = replayBattle(data.initial);
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
      } else if (a.type === 'hero') runner.deployHero(a.x, a.y);
      else if (a.type === 'ability') runner.activateHeroAbility();
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
export function canTarget(targets: 'ground' | 'air' | 'both' | undefined, kind: TroopKind) {
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
    gold: 205000,
    elixir: 165000,
    gems: 250,
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
  const s = 'level' in b ? BUILDINGS[b.kind].size : 0;
  return distance2D(Math.max(b.x - u.x, 0, u.x - b.x - s), Math.max(b.y - u.y, 0, u.y - b.y - s));
}
/** Find an actual obstruction on an approach to a building, ignoring stray walls. */
export function breachTarget(u: { x: number; y: number }, buildings: Building[]) {
  const walls = buildings.filter((b) => b.kind === 'wall' && b.hp > 0);
  if (!walls.length) return undefined;
  const structures = buildings
    .filter((b) => b.kind !== 'wall' && !isTrap(b.kind) && b.hp > 0)
    .sort((a, b) => distanceTo(u, a) - distanceTo(u, b));
  const candidates: Building[] = [];
  for (const structure of structures.slice(0, 5)) {
    const path = findPath(u, structure, buildings, TROOPS.wallbreaker.range);
    const obstruction = path
      .map((p) => walls.find((wall) => wall.x === Math.floor(p.x) && wall.y === Math.floor(p.y)))
      .find((wall) => wall !== undefined);
    if (obstruction) candidates.push(obstruction);
  }
  return candidates.sort((a, b) => distanceTo(u, a) - distanceTo(u, b))[0];
}
// A* on the occupancy grid. Walls carry a break-through cost, buildings are solid.
export function findPath(
  start: { x: number; y: number },
  target: Building | { x: number; y: number },
  buildings: Building[],
  range: number,
): { x: number; y: number }[] {
  const size = MAP_SIZE,
    blocked = new Uint8Array(size * size),
    wall = new Uint8Array(size * size);
  for (const b of buildings) {
    if (b.hp <= 0 || isTrap(b.kind)) continue;
    for (let x = b.x; x < b.x + BUILDINGS[b.kind].size; x++)
      for (let y = b.y; y < b.y + BUILDINGS[b.kind].size; y++) {
        if (b.kind === 'wall') wall[y * size + x] = 1;
        else blocked[y * size + x] = 1;
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
        s = 'level' in target ? BUILDINGS[target.kind].size : 0;
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
export function separateUnits(units: Unit[], buildings: Building[]) {
  const solid = new Set<number>();
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
    (!!TROOPS[u.kind].flying || !solid.has(Math.floor(y) * MAP_SIZE + Math.floor(x)));
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
