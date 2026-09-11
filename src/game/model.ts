import { OBSTACLES, OBSTACLE_GEMS, initialObstacles, overlapsObstacle, initialObstacleGrowth, advanceObstacles, type ObstacleGrowth, type Obstacle } from './obstacles';
import { TROOP_UNLOCK, SPELL_UNLOCK, facilityLevel } from './army-unlocks';
import {
  HERO_ABILITY,
  heroStats,
  heroLevelCap,
  heroUpgradeCost,
  heroUpgradeSeconds,
  type HeroProgress,
  type BattleHero,
} from './heroes';
import { launchProjectile, stepProjectiles, type CombatProjectile, type Weapon } from './projectiles';
import { campaignBlueprint, CAMPAIGN_LAYOUTS } from './campaign';
import { armySpace, spellSpace, emptyArmy, emptySpells, type ArmyPreset } from './army';
import { stepTraps, type TrapState } from './traps';
import {
  BUILDINGS,
  TROOPS,
  SPELLS,
  TROOP_KEYS,
  SPELL_KEYS,
  CAMPAIGN,
  HEAL_PER_SECOND,
  LIGHTNING_DAMAGE,
  MAX_TROOP_LEVEL,
  defenseDamage,
  isResourceBuilding,
  isTrap,
  gemCost,
  maxCountFor,
  maxLevelFor,
  researchCost,
  researchSeconds,
  storageCapacity,
  upgradeCost,
  upgradeSeconds,
  type BuildingKind,
  type TroopKind,
  type SpellKind,
  type Resource,
} from './data';
export interface Building {
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
  slots: { id: number; x: number; y: number }[];
}
export type Army = Record<TroopKind, number>;
export type SpellBook = Record<SpellKind, number>;
export interface BattleResult {
  gold: number;
  elixir: number;
  trophies: number;
  stars: number;
  destruction: number;
}
export interface RaidRecord {
  id: number;
  at: number;
  index: number;
  practice: boolean;
  duration: number;
  result: BattleResult;
  deployed: Army;
  spells: SpellBook;
  hero?: { level: number; abilityUsed: boolean };
}
export interface Save {
  version: 2;
  dark: number;
  king?: HeroProgress;
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
  lastTick: number;
  nextId: number;
  tutorial: boolean;
  claimedQuests?: string[];
  troopLevels?: Record<TroopKind, number>;
  research?: { kind: TroopKind; end: number };
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
  rageUntil?: number;
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
}
export interface Aura {
  kind: SpellKind;
  x: number;
  y: number;
  end: number;
}
export interface MortarShell {
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
  traps: Record<number, TrapState>;
  hero?: BattleHero;
  elapsed: number;
  /** Seconds left to scout before the battle clock starts. */
  prep: number;
  started: boolean;
  finished: boolean;
  destruction: number;
  stars: number;
  loot: { gold: number; elixir: number };
  result?: BattleResult;
  seed: number;
}
export type FX = {
  type:
    | 'hit'
    | 'destroy'
    | 'projectile'
    | 'impact'
    | 'collect'
    | 'spawn'
    | 'upgrade'
    | 'spell'
    | 'blast'
    | 'trap'
    | 'spring';
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
  selected: number | null = null;
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
  onChange = (_passive = false) => {};
  onEffect = (_fx: FX) => {};
  onToast = (_message: string) => {};
  revision = 0;
  clock = Date.now();
  constructor(saved?: Save) {
    this.state = saved ?? initialSave();
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
  get obstacles() { return this.state.obstacles ?? []; }
  get selectedObstacle() {
    return !this.battle && this.selected !== null && this.selected < 0
      ? this.obstacles.find((o) => o.id === -this.selected!) : undefined;
  }
  removeObstacle(id: number) {
    if (this.battle) return false;
    const o = this.obstacles.find((o) => o.id === id);
    if (!o || o.removeEnd) return false;
    const d = OBSTACLES[o.kind];
    if (this.state[d.resource] < d.cost) { this.notify(`Not enough ${d.resource}.`); return false; }
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
    if (this.state.gems < cost) { this.notify('Not enough gems.'); return false; }
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
    return (
      20 +
      this.state.buildings
        .filter((b) => b.kind === 'camp' && !b.constructing)
        .reduce((n, b) => n + 20 * b.level, 0)
    );
  }
  get spellCapacity() {
    return this.state.buildings
      .filter((b) => b.kind === 'spellfactory' && !b.constructing)
      .reduce((n, b) => n + b.level * 2, 0);
  }
  get armySize() {
    return TROOP_KEYS.reduce((n, k) => n + this.state.army[k] * TROOPS[k].space, 0);
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
    return this.state.troopLevels?.[kind] ?? 1;
  }
  troopStats(kind: TroopKind) {
    const d = TROOPS[kind],
      bonus = 1 + (this.troopLevel(kind) - 1) * 0.3;
    return { ...d, hp: Math.round(d.hp * bonus), damage: Math.round(d.damage * bonus) };
  }
  researchCost(kind: TroopKind) {
    return researchCost(kind, this.troopLevel(kind));
  }
  researchSeconds(kind: TroopKind) {
    return researchSeconds(kind, this.troopLevel(kind));
  }
  researchTroop(kind: TroopKind) {
    const lab = this.state.buildings.find((b) => b.kind === 'laboratory' && !b.constructing);
    if (!lab || lab.upgradeEnd) return this.notify('Your laboratory must be ready to research.');
    if (!this.troopUnlocked(kind))
      return this.notify(`Unlock ${TROOPS[kind].name} at Barracks level ${TROOP_UNLOCK[kind]} first.`);
    if (this.state.research) return this.notify('Research is already in progress.');
    if (this.troopLevel(kind) >= MAX_TROOP_LEVEL)
      return this.notify('This troop is at its maximum level.');
    if (lab.level <= this.troopLevel(kind))
      return this.notify(`Upgrade your laboratory to level ${this.troopLevel(kind) + 1}.`);
    const cost = this.researchCost(kind);
    if (this.state.elixir < cost) return this.notify('Not enough elixir.');
    this.state.elixir -= cost;
    this.state.research = { kind, end: this.clock + this.researchSeconds(kind) * 1000 };
    this.notify(`Researching level ${this.troopLevel(kind) + 1} ${TROOPS[kind].name}.`);
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
        progress: this.state.stars.reduce((a, b) => a + b, 0),
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
    ].map((q) => ({ ...q, claimed: this.state.claimedQuests?.includes(q.id) ?? false }));
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
  get busy() {
    return (
      this.state.buildings.filter((b) => b.upgradeEnd).length +
      Number(!!this.state.king?.upgradeEnd)
    );
  }
  resourceCap(kind: Resource) {
    if (kind === 'dark')
      return this.state.buildings
        .filter((b) => b.kind === 'darkstorage' && !b.constructing)
        .reduce((n, b) => n + b.level * 10000, 0);
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
    if (!this.state.obstacles || !this.state.obstacleGrowth || this.state.obstacleGemIndex === undefined) {
      this.state.obstacles ??= initialObstacles(this.state.buildings);
      this.state.obstacleGemIndex ??= 0;
      this.state.obstacleGrowth ??= initialObstacleGrowth(this.obstacles, now);
      structural = changed = true;
    }
    const dt = Math.max(0, Math.min(now - this.state.lastTick, 8 * 3600000)) / 1000;
    for (const b of this.state.buildings) {
      const productionSeconds = b.upgradeEnd
        ? Math.max(0, Math.min(dt, (now - b.upgradeEnd) / 1000))
        : dt;
      if (b.upgradeEnd && b.upgradeEnd <= now) {
        if (!b.constructing) b.level++;
        b.constructing = false;
        b.upgradeEnd = undefined;
        b.upgradeStart = undefined;
        b.maxHp = BUILDINGS[b.kind].hp * (1 + (b.level - 1) * 0.25);
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
      this.state.troopLevels ??= {
        swordsman: 1,
        archer: 1,
        giant: 1,
        wizard: 1,
        balloon: 1,
        goblin: 1,
        wallbreaker: 1,
      };
      this.state.troopLevels[kind] = Math.min(MAX_TROOP_LEVEL, this.troopLevel(kind) + 1);
      delete this.state.research;
      this.state.xp += 30;
      this.notify(`${TROOPS[kind].name} upgraded to level ${this.troopLevel(kind)}!`);
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
    for (const b of this.state.buildings) {
      if ((id === undefined || b.id === id) && b.stored >= 1) {
        const k = b.kind === 'goldmine' ? 'gold' : b.kind === 'darkdrill' ? 'dark' : 'elixir';
        const amount = Math.min(Math.floor(b.stored), this.resourceCap(k) - this.state[k]);
        if (amount <= 0) continue;
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
    }
    if (gold + elixir + dark) {
      this.state.stats.collected += gold + elixir + dark;
      this.notify(
        `Collected ${gold.toLocaleString()} gold · ${elixir.toLocaleString()} elixir${dark ? ` · ${dark.toLocaleString()} dark elixir` : ''}`,
      );
      this.changed();
    } else this.notify('Your collectors are working. Come back in a moment.');
  }
  canPlace(kind: BuildingKind, x: number, y: number, ignore?: number) {
    const size = BUILDINGS[kind].size;
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 2 ||
      y < 2 ||
      x + size > 26 ||
      y + size > 26
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
    const d = BUILDINGS[kind];
    const limit = this.maxCount(kind);
    if (limit === 0)
      return this.notify(`Upgrade your Town Hall to unlock the ${d.name.toLowerCase()}.`);
    if (this.countOf(kind) >= limit)
      return this.notify(
        `Town Hall ${this.townhallLevel} allows ${limit} ${d.name.toLowerCase()}. Upgrade it for more.`,
      );
    if (this.state[d.resource] < d.cost) return this.notify(`Not enough ${d.resource}.`);
    if (kind !== 'wall' && this.busy >= this.builders)
      return this.notify('All builders are busy. Finish an upgrade first.');
    this.selected = null;
    this.moving = null;
    this.placement = kind;
    this.changed();
  }
  place(x: number, y: number) {
    if (!this.placement) return false;
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
      this.changed();
      return true;
    }
    if (
      this.state[d.resource] < d.cost ||
      this.countOf(kind) >= this.maxCount(kind) ||
      (kind !== 'wall' && this.busy >= this.builders)
    ) {
      this.notify('Unable to build. Check your resources and builders.');
      return false;
    }
    this.state[d.resource] -= d.cost;
    const b = makeBuilding(this.state.nextId++, kind, x, y, 1);
    if (kind !== 'wall') {
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
      kind === 'wall' ? 'Wall placed.' : `Construction started — ${formatTime(d.build)}.`,
    );
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
    const b = this.state.buildings.find((b) => b.id === id);
    if (!b || b.upgradeEnd) return;
    if (b.kind === 'laboratory' && this.state.research)
      return this.notify('Finish troop research before upgrading the laboratory.');
    if (b.level >= BUILDINGS[b.kind].maxLevel)
      return this.notify('This building is at its maximum level.');
    if (b.level >= this.maxLevel(b.kind))
      return this.notify(`Upgrade your Town Hall to raise this past level ${b.level}.`);
    if (this.busy >= this.builders) return this.notify('All builders are busy.');
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
    const b = this.state.buildings.find((b) => b.id === id);
    if (!b) return;
    this.moving = id;
    this.placement = b.kind;
    this.selected = null;
    this.changed();
  }
  cancel() {
    this.selected = null;
    this.placement = null;
    this.moving = null;
    this.activeSpell = null;
    this.activeHero = false;
    this.changed();
  }

  // ---------------------------------------------------------------- edit mode
  private positions(): Layout['slots'] {
    return this.state.buildings.map((b) => ({ id: b.id, x: b.x, y: b.y }));
  }
  private recordPositions() {
    this.undoStack.push(this.positions());
    if (this.undoStack.length > 60) this.undoStack.shift();
    this.redoStack = [];
  }
  private applyPositions(slots: Layout['slots']) {
    for (const slot of slots) {
      const b = this.state.buildings.find((v) => v.id === slot.id);
      if (b) {
        b.x = slot.x;
        b.y = slot.y;
      }
    }
  }
  get canUndo() {
    return this.undoStack.length > 0;
  }
  /**
   * Opens one history entry for a whole drag. Without it a single drag across ten
   * tiles would take ten presses of undo to reverse.
   */
  beginDrag() {
    this.dragOpen = false;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }
  beginEdit() {
    if (this.battle) return;
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
    this.editing = false;
    this.undoStack = [];
    this.redoStack = [];
    this.changed();
  }
  /** Relocates a building during edit mode. Returns false when the ground is taken. */
  dragTo(id: number, x: number, y: number) {
    const b = this.state.buildings.find((v) => v.id === id);
    if (!b || !this.editing) return false;
    if (b.x === x && b.y === y) return true;
    if (!this.canPlace(b.kind, x, y, id)) return false;
    if (!this.dragOpen) {
      this.recordPositions();
      this.dragOpen = true;
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
    this.redoStack.push(this.positions());
    this.applyPositions(previous);
    this.changed();
  }
  redo() {
    if (this.layoutOverlapsObstacles(this.redoStack.at(-1) ?? []))
      return this.notify('Clear the obstacles beneath this layout before redoing.');
    const next = this.redoStack.pop();
    if (!next) return this.notify('Nothing left to redo.');
    this.undoStack.push(this.positions());
    this.applyPositions(next);
    this.changed();
  }
  get layouts() {
    return this.state.layouts ?? [];
  }
  saveLayout(slot: number) {
    this.state.layouts ??= [];
    while (this.state.layouts.length < 3)
      this.state.layouts.push({ name: `Layout ${this.state.layouts.length + 1}`, slots: [] });
    if (slot < 0 || slot > 2) return;
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
    if (this.layoutOverlapsObstacles(layout.slots)) return this.notify('Clear the obstacles beneath this layout before restoring it.');
    this.recordPositions();
    this.applyPositions(layout.slots);
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
      return this.notify(`${TROOPS[kind].name} requires a completed level ${TROOP_UNLOCK[kind]} Barracks.`);
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
      return this.notify(`${SPELLS[kind].name} requires a completed level ${SPELL_UNLOCK[kind]} Spell Factory.`);
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
    if (troop) return `${TROOPS[troop].name} requires a completed level ${TROOP_UNLOCK[troop]} Barracks.`;
    const spell = SPELL_KEYS.find((k) => spells[k] > this.state.spells[k] && !this.spellUnlocked(k));
    if (spell) return `${SPELLS[spell].name} requires a completed level ${SPELL_UNLOCK[spell]} Spell Factory.`;
    return null;
  }
  private prepareArmy(army: Army, spells: SpellBook) {
    const issue = this.armyPreparationIssue(army, spells);
    if (issue) { this.notify(issue); return false; }
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
    const b = this.battle,
      h = b?.hero;
    if (!b || b.finished || !h || h.unitId !== null || this.deployBlocked(x, y)) return false;
    this.beginFight();
    const stats = heroStats(h.level, h.townhall);
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
    const b = this.battle,
      h = b?.hero;
    const u = b?.units.find((u) => u.id === h?.unitId);
    if (
      !b ||
      b.finished ||
      !h ||
      !u ||
      h.abilityUsed ||
      h.townhall < 7 ||
      u.spent ||
      (!automatic && u.hp <= 0)
    )
      return false;
    h.abilityUsed = true;
    h.rageUntil = b.elapsed + HERO_ABILITY.duration;
    u.hp = Math.min(u.maxHp, u.hp + u.maxHp * HERO_ABILITY.healFraction);
    for (let i = 0; i < HERO_ABILITY.summons; i++) {
      const stats = this.troopStats('swordsman');
      b.units.push({
        id: this.state.nextId++,
        kind: 'swordsman',
        summoned: true,
        rageUntil: b.elapsed + HERO_ABILITY.duration,
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
    }
    this.onEffect({ type: 'trap', x: u.x, y: u.y, text: 'IRON FIST!', color: 0xffcc4d });
    this.changed();
    return true;
  }
  visibleBuilding(building: Building) {
    return !this.battle || !isTrap(building.kind) || !!this.battle.traps[building.id];
  }
  startBattle(index: number, practice = false) {
    if (this.battle) return;
    if (index < 0 || index >= CAMPAIGN.length || (index > 0 && !this.state.stars[index - 1]))
      return;
    if (this.armySize === 0 && !this.heroReady)
      return this.notify('Prepare an army or a hero before attacking.');
    this.cancel();
    this.editing = false;
    if (!practice) {
      this.state.lastArmy = { ...this.state.army };
      this.state.lastSpells = { ...this.state.spells };
    }
    this.battle = {
      index,
      practice,
      carriedArmy: { ...this.state.army },
      buildings: practice
        ? this.state.buildings.map((building) => ({ ...building, hp: building.maxHp, cooldown: 0 }))
        : enemyBase(index),
      units: [],
      remaining: { ...this.state.army },
      spells: { ...this.state.spells },
      carried: { ...this.state.spells },
      auras: [],
      shells: [],
      defenseTargets: {},
      traps: {},
      hero: this.heroReady
        ? {
            level: this.state.king!.level,
            townhall: this.townhallLevel,
            unitId: null,
            abilityUsed: false,
            rageUntil: 0,
          }
        : undefined,
      elapsed: 0,
      prep: PREP_SECONDS,
      started: false,
      finished: false,
      destruction: 0,
      stars: 0,
      loot: { gold: 0, elixir: 0 },
      seed: 1337 + index,
    };
    this.activeTroop = TROOP_KEYS.find((k) => this.state.army[k] > 0) ?? 'swordsman';
    this.activeSpell = null;
    this.activeHero = false;
    this.changed();
  }
  /** True where a troop may not be dropped: the red boundary the scene draws. */
  deployBlocked(x: number, y: number) {
    const b = this.battle;
    if (!b) return true;
    if (x < 1 || y < 1 || x > 27 || y > 27) return true;
    return b.buildings.some(
      (v) =>
        v.hp > 0 &&
        v.kind !== 'wall' &&
        !isTrap(v.kind) &&
        x > v.x - 1.5 &&
        x < v.x + BUILDINGS[v.kind].size + 1.5 &&
        y > v.y - 1.5 &&
        y < v.y + BUILDINGS[v.kind].size + 1.5,
    );
  }
  deploy(x: number, y: number) {
    if (this.activeHero) return this.deployHero(x, y);
    const b = this.battle,
      k = this.activeTroop;
    if (!b || b.finished || b.remaining[k] <= 0) return false;
    if (this.deployBlocked(x, y)) {
      this.notify('Deploy on the grass outside the red boundary.');
      return false;
    }
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
    const b = this.battle,
      k = this.activeSpell;
    if (!b || b.finished || !k || b.spells[k] <= 0) return false;
    if (x < 0 || y < 0 || x > 28 || y > 28) return false;
    this.beginFight();
    b.spells[k]--;
    if (!b.practice) this.state.spells[k]--;
    const d = SPELLS[k];
    this.onEffect({ type: 'spell', x, y, spell: k, radius: d.radius });
    if (k === 'lightning') {
      for (const v of b.buildings)
        if (
          v.hp > 0 &&
          Math.hypot(v.x + BUILDINGS[v.kind].size / 2 - x, v.y + BUILDINGS[v.kind].size / 2 - y) <=
            d.radius
        )
          this.damage(v, LIGHTNING_DAMAGE);
    } else b.auras.push({ kind: k, x, y, end: b.elapsed + d.duration });
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
  private inAura(kind: SpellKind, x: number, y: number) {
    const b = this.battle;
    if (!b) return false;
    const radius = SPELLS[kind].radius;
    return b.auras.some((a) => a.kind === kind && Math.hypot(a.x - x, a.y - y) <= radius);
  }
  step(dt: number) {
    const b = this.battle;
    if (!b || b.finished) return;
    if (!b.started) {
      // Scouting. The battle clock has not begun, but the countdown to it has.
      b.prep = Math.max(0, b.prep - dt);
      if (b.prep <= 0) b.started = true;
      return;
    }
    // A long frame or imported replay delta cannot land a shot after the raid deadline.
    dt = Math.min(dt, Math.max(0, BATTLE_SECONDS - b.elapsed));
    b.elapsed += dt;
    stepProjectiles(b, (target, power) => this.damage(target, power), this.onEffect);
    b.auras = b.auras.filter((a) => a.end > b.elapsed);
    for (const u of b.units) {
      if (u.hp <= 0) continue;
      if ((u.springUntil ?? 0) > b.elapsed) {
        u.attacking = false;
        continue;
      }
      const troop = TROOPS[u.kind];
      if (this.inAura('heal', u.x, u.y))
        u.hp = Math.min(u.maxHp, u.hp + HEAL_PER_SECOND * dt * (u.hero ? 0.5 : 1));
      const raged =
        this.inAura('rage', u.x, u.y) ||
        (u.rageUntil ?? 0) > b.elapsed ||
        !!(u.hero && b.hero && b.hero.rageUntil > b.elapsed);
      u.cooldown -= dt;
      u.pathAt -= dt;
      u.attacking = false;
      const base =
        u.hero && b.hero
          ? { ...this.troopStats(u.kind), ...heroStats(b.hero.level, b.hero.townhall) }
          : this.troopStats(u.kind);
      const d = {
        ...base,
        damage: raged ? base.damage * 1.7 : base.damage,
        speed: raged ? base.speed * (u.hero ? HERO_ABILITY.speed : 1.6) : base.speed,
      };
      let target = b.buildings.find((t) => t.id === u.target && t.hp > 0 && !isTrap(t.kind));
      if (!target) {
        const alive = b.buildings.filter((v) => v.hp > 0 && v.kind !== 'wall' && !isTrap(v.kind));
        const preferred = troop.prefersResources
          ? alive.filter((v) => isResourceBuilding(v.kind))
          : troop.prefersDefenses
            ? alive.filter((v) => BUILDINGS[v.kind].damage)
            : alive;
        target =
          (troop.wallBreaker ? breachTarget(u, b.buildings) : undefined) ??
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
            this.detonate(u, d.damage);
            continue;
          }
          const damage =
            d.damage * (troop.prefersResources && isResourceBuilding(target.kind) ? 2 : 1);
          if (d.range > 2 || troop.flying) {
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
                splashScale: u.kind === 'wizard' ? 0.35 : 1,
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
          len = Math.hypot(dx, dy) || 1,
          move = Math.min(d.speed * dt, len);
        u.x += (dx / len) * move;
        u.y += (dy / len) * move;
        continue;
      }
      if (!u.path.length || u.pathAt <= 0) {
        u.path = findPath(u, target, b.buildings, d.range);
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
              this.detonate(u, d.damage);
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
                  damage: d.damage * 1.6,
                },
                this.onEffect,
              );
            else {
              this.damage(wall, d.damage * 1.6);
              this.onEffect({ type: 'hit', x: wall.x + 0.5, y: wall.y + 0.5 });
            }
          }
          continue;
        }
        const dx = next.x - u.x,
          dy = next.y - u.y,
          len = Math.hypot(dx, dy),
          move = d.speed * dt;
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
    separateUnits(b.units, b.buildings);
    if (stepTraps(b, dt, this.onEffect)) this.changed();
    // Shells land where the target stood when fired. Air units and troops that
    // have escaped the impact circle take no damage, even if they were targeted.
    for (const shell of b.shells) {
      if (shell.impact > b.elapsed) continue;
      for (const u of b.units)
        if (
          u.hp > 0 &&
          !TROOPS[u.kind].flying &&
          Math.hypot(u.x - shell.x, u.y - shell.y) <= shell.radius
        )
          u.hp -= shell.damage;
      this.onEffect({ type: 'blast', x: shell.x, y: shell.y, radius: shell.radius });
    }
    b.shells = b.shells.filter((shell) => shell.impact > b.elapsed);
    for (const tower of b.buildings) {
      const d = BUILDINGS[tower.kind];
      if (!d.damage || tower.hp <= 0 || tower.constructing || tower.upgradeEnd) continue;
      tower.cooldown -= dt;
      if (tower.cooldown > 0) continue;
      const center = { x: tower.x + d.size / 2, y: tower.y + d.size / 2 };
      const targets = b.units.filter(
        (u) =>
          u.hp > 0 &&
          canTarget(d.targets, u.kind) &&
          Math.hypot(u.x - center.x, u.y - center.y) < d.range! &&
          Math.hypot(u.x - center.x, u.y - center.y) >= (d.minRange ?? 0),
      );
      // Keep firing at the same eligible target until it dies or leaves range.
      const target =
        targets.find((u) => u.id === b.defenseTargets[tower.id]) ??
        targets.sort(
          (a, c) =>
            Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(c.x - center.x, c.y - center.y),
        )[0];
      if (target) {
        b.defenseTargets[tower.id] = target.id;
        tower.cooldown = d.rate!;
        const power =
          defenseDamage(tower.kind, tower.level) *
          (b.practice ? 1 : CAMPAIGN_LAYOUTS[b.index].defense);
        if (tower.kind === 'mortar') {
          b.shells.push({
            fromX: center.x,
            fromY: center.y,
            x: target.x,
            y: target.y,
            launched: b.elapsed,
            impact: b.elapsed + 1.15,
            damage: power,
            radius: 1.5,
          });
          continue;
        }
        launchProjectile(
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
              tower.kind === 'airdefense'
                ? 'rocket'
                : tower.kind === 'archertower'
                  ? 'arrow'
                  : tower.kind === 'wizardtower'
                    ? 'arcane'
                    : 'cannonball',
            sourceId: tower.id,
            targetId: target.id,
            targetBuilding: false,
          },
          this.onEffect,
        );
      }
    }
    const king = b.units.find((u) => u.hero);
    if (king && !king.spent && king.hp <= king.maxHp * 0.2 && b.hero && !b.hero.abilityUsed)
      this.activateHeroAbility(true);
    for (const u of b.units) {
      if (u.hp > 0) continue;
      u.defeatedAt ??= b.elapsed;
      if (u.spent) continue;
      u.spent = true;
      const troop = TROOPS[u.kind];
      if (!troop.deathDamage) continue;
      if (troop.wallBreaker) {
        const bonus = this.troopStats(u.kind).damage / troop.damage;
        this.detonate(u, troop.deathDamage * bonus);
        continue;
      }
      this.onEffect({ type: 'blast', x: u.x, y: u.y, radius: troop.deathRadius });
      for (const v of b.buildings)
        if (v.hp > 0 && distanceTo(u, v) <= (troop.deathRadius ?? 1.5))
          this.damage(v, troop.deathDamage);
    }
    this.refreshBattleScore();
    if (
      b.destruction === 100 ||
      b.elapsed >= BATTLE_SECONDS ||
      (!b.shells.length &&
        !b.projectiles?.length &&
        !b.units.some((u) => u.hp > 0) &&
        !TROOP_KEYS.some((k) => b.remaining[k] > 0) &&
        !SPELL_KEYS.some((k) => b.spells[k] > 0) &&
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
    if (b.practice) {
      b.loot = { gold: 0, elixir: 0 };
      return;
    }
    // Each resource building pays out as it is damaged. Storages hold four
    // shares, collectors one, and the Town Hall two of each resource.
    for (const resource of ['gold', 'elixir'] as const) {
      const weight = (v: Building) =>
        v.kind === 'townhall'
          ? 2
          : v.kind === (resource === 'gold' ? 'goldstorage' : 'elixirstorage')
            ? 4
            : v.kind === (resource === 'gold' ? 'goldmine' : 'collector')
              ? 1
              : 0;
      const total = structures.reduce((n, v) => n + weight(v), 0);
      const taken = total
        ? structures.reduce((n, v) => n + weight(v) * (1 - Math.max(0, v.hp) / v.maxHp), 0) / total
        : dead / Math.max(1, structures.length);
      b.loot[resource] = Math.floor(CAMPAIGN[b.index][resource] * Math.min(1, Math.max(0, taken)));
    }
  }
  private detonate(u: Unit, power: number) {
    u.hp = 0;
    u.spent = true;
    const radius = TROOPS[u.kind].deathRadius ?? 1.6;
    this.onEffect({ type: 'blast', x: u.x, y: u.y, radius });
    for (const building of this.battle?.buildings ?? [])
      if (building.hp > 0 && distanceTo(u, building) <= radius)
        this.damage(building, power * (building.kind === 'wall' ? 40 : 1));
  }
  damage(b: Building, n: number) {
    if (b.hp <= 0 || isTrap(b.kind)) return;
    b.hp -= n;
    if (b.hp <= 0) {
      b.hp = 0;
      this.onEffect({
        type: 'destroy',
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
    const b = this.battle;
    if (!b || b.finished) return;
    this.refreshBattleScore();
    b.finished = true;
    b.projectiles = [];
    const trophies = b.practice ? 0 : b.stars ? b.stars * 8 : -10;
    const gold = b.practice
        ? 0
        : Math.max(0, Math.min(b.loot.gold, this.resourceCap('gold') - this.state.gold)),
      elixir = b.practice
        ? 0
        : Math.max(0, Math.min(b.loot.elixir, this.resourceCap('elixir') - this.state.elixir));
    this.state.gold += gold;
    this.state.elixir += elixir;
    this.state.trophies = Math.max(0, this.state.trophies + trophies);
    if (!b.practice) {
      this.state.stars[b.index] = Math.max(this.state.stars[b.index] ?? 0, b.stars);
      this.state.stats.raids++;
      this.state.stats.destroyed += b.buildings.filter(
        (v) => v.hp <= 0 && v.kind !== 'wall' && !isTrap(v.kind),
      ).length;
      this.state.xp += b.stars * 15;
    }
    b.result = { gold, elixir, trophies, stars: b.stars, destruction: b.destruction };
    const deployed = emptyArmy(),
      spells = emptySpells();
    for (const k of TROOP_KEYS) deployed[k] = b.carriedArmy[k] - b.remaining[k];
    for (const k of SPELL_KEYS) spells[k] = b.carried[k] - b.spells[k];
    this.state.raidLog = [
      {
        id: this.state.nextId++,
        at: this.clock,
        index: b.index,
        practice: b.practice,
        duration: Math.min(BATTLE_SECONDS, b.elapsed),
        result: { ...b.result },
        deployed,
        spells,
        ...(b.hero?.unitId != null
          ? { hero: { level: b.hero.level, abilityUsed: b.hero.abilityUsed } }
          : {}),
      },
      ...(this.state.raidLog ?? []),
    ].slice(0, 20);
    this.changed();
  }
  returnHome() {
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
    const h = Math.floor(s / 3600),
      m = Math.round((s % 3600) / 60);
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
  const hp = BUILDINGS[kind].hp * (1 + (level - 1) * 0.25);
  return {
    id,
    kind,
    x,
    y,
    level,
    hp,
    maxHp: hp,
    stored: kind === 'goldmine' || kind === 'collector' ? 1800 : 0,
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
  add('cannon', 9, 10, 2);
  add('archertower', 15, 15, 2);
  add('barracks', 4, 15, 2);
  add('camp', 10, 21);
  add('camp', 21, 11);
  add('goldmine', 3, 8, 2);
  add('goldmine', 5, 4);
  add('collector', 17, 4, 2);
  add('collector', 21, 7);
  add('builder', 16, 23);
  add('builder', 21, 19);
  add('goldstorage', 6, 20);
  add('elixirstorage', 9, 4);
  add('archertower', 21, 15);
  add('cannon', 5, 11);
  for (let n = 8; n <= 19; n++) {
    add('wall', n, 8, 2);
    if (n !== 13 && n !== 14) add('wall', n, 19, 2);
  }
  for (let n = 9; n < 19; n++) {
    add('wall', 8, n, 2);
    if (n !== 13 && n !== 14) add('wall', 19, n, 2);
  }
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
    version: 2,
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
export function enemyBase(index: number) {
  return campaignBlueprint(index).map(([kind, x, y], i) => {
    const b = makeBuilding(1000 + i, kind, x, y, Math.min(3, 1 + Math.floor(index / 4)));
    b.hp *= CAMPAIGN_LAYOUTS[index].health;
    b.maxHp = b.hp;
    return b;
  });
}
export function distanceTo(u: { x: number; y: number }, b: Building) {
  const s = BUILDINGS[b.kind].size;
  return Math.hypot(Math.max(b.x - u.x, 0, u.x - b.x - s), Math.max(b.y - u.y, 0, u.y - b.y - s));
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
  target: Building,
  buildings: Building[],
  range: number,
): { x: number; y: number }[] {
  const size = 28,
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
  const sx = Math.max(0, Math.min(27, Math.floor(start.x))),
    sy = Math.max(0, Math.min(27, Math.floor(start.y))),
    first = sy * size + sx;
  const cost = new Float64Array(size * size).fill(Infinity),
    prev = new Int16Array(size * size).fill(-1),
    closed = new Uint8Array(size * size);
  cost[first] = 0;
  const open = [first];
  let goal = -1;
  while (open.length) {
    let best = 0;
    for (let i = 1; i < open.length; i++) {
      const a = open[i],
        c = open[best];
      if (
        cost[a] + distanceTo({ x: (a % size) + 0.5, y: Math.floor(a / size) + 0.5 }, target) <
        cost[c] + distanceTo({ x: (c % size) + 0.5, y: Math.floor(c / size) + 0.5 }, target)
      )
        best = i;
    }
    const current = open.splice(best, 1)[0];
    if (closed[current]) continue;
    closed[current] = 1;
    const x = current % size,
      y = Math.floor(current / size);
    if (distanceTo({ x: x + 0.5, y: y + 0.5 }, target) <= range) {
      goal = current;
      break;
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
        open.push(n);
      }
    }
  }
  if (goal < 0) return [];
  const path = [];
  while (goal !== first && goal >= 0) {
    path.push({ x: (goal % size) + 0.5, y: Math.floor(goal / size) + 0.5 });
    goal = prev[goal];
  }
  return path.reverse();
}

/** Local, deterministic crowd separation. A sparse grid bounds neighbor work. */
export function separateUnits(units: Unit[], buildings: Building[]) {
  const solid = new Set<number>();
  for (const b of buildings)
    if (b.hp > 0 && !isTrap(b.kind)) {
      const size = BUILDINGS[b.kind].size;
      for (let x = b.x; x < b.x + size; x++)
        for (let y = b.y; y < b.y + size; y++) solid.add(y * 28 + x);
    }
  const buckets = new Map<number, Unit[]>();
  const alive = units.filter((u) => u.hp > 0);
  for (const u of alive) {
    const key = Math.floor(u.y) * 28 + Math.floor(u.x);
    const bucket = buckets.get(key) ?? [];
    bucket.push(u);
    buckets.set(key, bucket);
  }
  // Air and ground share no space, so they never push each other around.
  const free = (u: Unit, x: number, y: number) =>
    x >= 0.1 &&
    y >= 0.1 &&
    x < 27.9 &&
    y < 27.9 &&
    (!!TROOPS[u.kind].flying || !solid.has(Math.floor(y) * 28 + Math.floor(x)));
  for (const u of alive) {
    const cx = Math.floor(u.x),
      cy = Math.floor(u.y);
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) {
        for (const v of buckets.get((cy + oy) * 28 + cx + ox) ?? []) {
          if (v.id <= u.id) continue;
          if (!!TROOPS[u.kind].flying !== !!TROOPS[v.kind].flying) continue;
          const spacing = (u.kind === 'giant' ? 0.85 : 0.5) + (v.kind === 'giant' ? 0.85 : 0.5);
          const desired = spacing / 2;
          let dx = v.x - u.x,
            dy = v.y - u.y;
          let distance = Math.hypot(dx, dy);
          if (distance >= desired) continue;
          if (distance < 0.0001) {
            const angle = ((u.id * 127 + v.id * 31) % 628) / 100;
            dx = Math.cos(angle);
            dy = Math.sin(angle);
            distance = 1;
          }
          const push = Math.min(0.07, (desired - Math.hypot(v.x - u.x, v.y - u.y)) * 0.25),
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
