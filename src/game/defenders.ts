import { poisonAvoidanceTarget, type DefenderPoisonArea } from './poison-avoidance';
import { defenderPoisonScales } from './defender-poison';
import type { DefenderHitPoison } from './defender-hit-poison';
import { defenderFrostScales, type DefenderFrost } from './defender-frost';
import type { HeroKind } from './native-hero-data';
import { MAP_SIZE } from './grid';
import { hurtUnit } from './native-status';
import { distance2D } from './distance';
import { stepGarrisonDefender, type GarrisonAttack, type GarrisonShot } from './garrison-combat';
// Later garrison families: spawning summons and concealed Royal Ghosts cannot be selected.
import {
  garrisonDefenderTargetable,
  type GarrisonBolt,
  type GarrisonChain,
  type GarrisonPush,
  type GarrisonSummonState,
} from './garrison-abilities';
import type { GarrisonKind } from './garrison-kinds';
import { stepGarrisonStatus } from './garrison-status';
import { TROOPS, isDefense, isResourceBuilding, isTrap, type TroopDef } from './data';
import { findPath, distanceTo, type Battle, type Building, type Unit, type FX } from './model';
import { launchProjectile, type CombatProjectile } from './projectiles';
import { presentBuilding, targetableBuilding } from './hidden-tesla';
// Late campaign Spell Tower Rage and Invisibility, and activated late Defense classes
// (all neutral without version 44 late state).
import { lateActivatedDefense, lateDefenderHidden, lateDefenderStats } from './late-campaign';
import { untargetable } from './spell-effects';
import {
  SKELETON_TRAP,
  skeletonCount,
  skeletonSpawnLevel,
  skeletonStats,
  type SkeletonMode,
} from './skeleton-stats';

interface DefenderState {
  id: number;
  sourceId: number;
  mode: SkeletonMode;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  spawnedAt: number;
  cooldown: number;
  target: number | null;
  path: { x: number; y: number }[];
  pathAt: number;
  attacking: boolean;
  alerted?: boolean;
  /** Walking out of poison, or waiting clear of a poisoned home point. */
  avoidingPoison?: true;
  defeatedAt?: number;
  stunnedUntil?: number;
  /** Version 68: full Freeze cue, separate from Lightning and other short stuns. */
  frozenUntil?: number;
  /** Version 76: intrinsic attacker poison-on-hit, separate from area-spell exposure. */
  hitPoison?: DefenderHitPoison;
  /** Version 77: partial frost from a native ranged hit, independent of full Freeze. */
  frost?: DefenderFrost;
  /** Version 45 Poison Spell exposure: slows movement and attacks while it lasts. */
  poison?: {
    since: number;
    until: number;
    speed: number;
    attack: number;
    /** Version 64: cloud positions used by idle garrison avoidance. */
    areas?: DefenderPoisonArea[];
    /** Version 62: aggregate poison damage refills at the strongest active effective DPS. */
    damage?: { at: number; budget: number; cap: number; dps: number };
  };
}
export interface GarrisonDefender extends DefenderState {
  kind: GarrisonKind;
  level: number;
  attacks: GarrisonAttack[];
  engaged?: boolean;
  deathResolved?: boolean;
  /** Version-44 garrison families (see garrison-combat.ts); absent for Dragon/Balloon. */
  attackCount?: number;
  shots?: GarrisonShot[];
  longShots?: number;
  tantrum?: boolean;
  /** Later families (see garrison-abilities.ts): split-timer recovery still to run. */
  recovery?: number;
  /** Secondary troops and summons: push-out from their spawn point, then summon SpawnIdle. */
  push?: GarrisonPush;
  idleUntil?: number;
  /** The Golem, Lava Hound or Witch this unit came from. */
  parentId?: number;
  /** Golem and Lava Hound: the secondary wave has spawned. */
  split?: boolean;
  /** Electro Dragon: the chain lightning in progress and the death bolts. */
  chain?: GarrisonChain;
  bolts?: GarrisonBolt[];
  /** Witch summon cycle. */
  summon?: GarrisonSummonState;
  /** Electro Titan: aura pulses already applied. */
  auraHits?: number;
  /** Royal Ghost: concealed and ignoring obstacles until this battle time. */
  stealthUntil?: number;
}
/** Town Hall 18 Guardian (version 51+); rules live in native-guardians.ts. */
export interface GuardianDefender extends DefenderState {
  kind: 'guardian';
  guardian: 'longshot' | 'smasher' | 'logger';
  level: number;
  home: { x: number; y: number };
  phase: 'waiting' | 'leaping' | 'fighting';
  leap?: { from: { x: number; y: number }; to: { x: number; y: number }; at: number };
  /** Attack clock (slowed by poison), next ready time and pending release. */
  clock?: number;
  readyAt: number;
  releaseAt?: number;
  enraged?: boolean;
  deathResolved?: boolean;
  /** Friendly defensive Rage (Spell Tower, Smasher death rage). */
  boost?: { until: number; damage: number; speed: number };
}
/** Builder's Hut Defending Builder (version 45+): repairs buildings and cannot be attacked. */
export interface RepairDefender extends DefenderState {
  kind: 'repairer';
  level: number;
  clock?: number;
  readyAt: number;
  /** Hiding in the destroyed hut's bunker. */
  hidden?: boolean;
}
export interface HeroDefender extends DefenderState {
  kind: 'hero';
  hero: HeroKind;
  level: number;
  home: { x: number; y: number };
}
export type Defender =
  | HeroDefender
  | (DefenderState & {
      kind: 'skeleton';
      /** Skeleton level this coffin releases; absent on recordings made before tier 5. */
      spawnLevel?: number;
    })
  | GarrisonDefender
  | GuardianDefender
  | RepairDefender;
/** A Clan Castle defender: the skeleton, Guardian and repair families have their own rules. */
export const isGarrisonDefender = (d: Defender): d is GarrisonDefender =>
  d.kind !== 'skeleton' && d.kind !== 'guardian' && d.kind !== 'repairer' && d.kind !== 'hero';
export function hurtDefender(battle: Battle, defender: Defender, power: number, hitAt?: number) {
  const at = hitAt ?? battle.elapsed;
  if (defender.hp <= 0 || defender.kind === 'repairer') return;
  if (defender.kind !== 'skeleton' && defender.spawnedAt > at + (hitAt === undefined ? 0 : 1e-9))
    return;
  defender.hp = Math.max(0, defender.hp - power);
  if (!defender.hp) {
    defender.defeatedAt = at;
    defender.attacking = false;
  }
}
export function damageDefenders(
  battle: Battle,
  point: { x: number; y: number },
  power: number,
  radius: number,
  targets: 'ground' | 'air' | 'both' = 'ground',
  skipId?: number,
  hitAt?: number,
) {
  for (const enemy of battle.defenders ?? [])
    if (
      enemy.id !== skipId &&
      enemy.hp > 0 &&
      (hitAt === undefined || enemy.spawnedAt <= hitAt + 1e-9) &&
      (targets === 'both' || enemy.mode === targets) &&
      distance2D(enemy.x - point.x, enemy.y - point.y) <= radius
    )
      hurtDefender(battle, enemy, power, hitAt);
}
export function spawnSkeleton(battle: Battle, source: Building, at: number, index: number) {
  const mode = source.skeletonMode ?? 'ground',
    spawnLevel = skeletonSpawnLevel(source.level),
    stats = skeletonStats(mode, spawnLevel);
  // Small deterministic offsets keep the burst legible and inside its passable tile.
  const angle = (index * Math.PI * 2) / skeletonCount(source.level);
  const defender: Defender = {
    id: Math.min(0, ...(battle.defenders ?? []).map((d) => d.id)) - 1,
    kind: 'skeleton',
    sourceId: source.id,
    mode,
    // Only the fifth coffin tier releases anything but the level 1 skeleton; leaving the
    // default off keeps every archived battle state byte-identical.
    ...(spawnLevel > 1 ? { spawnLevel } : {}),
    x: source.x + 0.5 + Math.cos(angle) * 0.18,
    y: source.y + 0.5 + Math.sin(angle) * 0.18,
    hp: stats.hp,
    maxHp: stats.hp,
    spawnedAt: at,
    cooldown: 0,
    target: null,
    path: [],
    pathAt: 0,
    attacking: false,
  };
  (battle.defenders ??= []).push(defender);
  return defender;
}
function moveAlong(
  unit: { x: number; y: number; path: { x: number; y: number }[] },
  speed: number,
  dt: number,
) {
  let travel = speed * dt;
  while (unit.path.length && travel > 0) {
    const next = unit.path[0],
      dx = next.x - unit.x,
      dy = next.y - unit.y,
      len = distance2D(dx, dy);
    if (len <= travel) {
      unit.x = next.x;
      unit.y = next.y;
      unit.path.shift();
      travel -= len;
    } else {
      unit.x += (dx / len) * travel;
      unit.y += (dy / len) * travel;
      break;
    }
  }
}
export function stepDefenders(battle: Battle, dt: number, effect: (fx: FX) => void) {
  // Home defenders jump their own walls. Built on first route search, from the list as it
  // stood at the start of the phase.
  const buildingsAtStart = battle.buildings;
  let structures: Building[] | undefined;
  for (const defender of battle.defenders ?? []) {
    if (defender.kind === 'guardian' || defender.kind === 'repairer' || defender.kind === 'hero')
      continue;
    if (defender.kind !== 'skeleton') {
      stepGarrisonDefender(battle, defender, dt, effect);
      continue;
    }
    defender.attacking = false;
    if (defender.hp <= 0) {
      delete defender.avoidingPoison;
      // A fallen skeleton never moves again; drop its waypoints from clones and saves.
      if (battle.dropFallenPaths && defender.path.length) defender.path = [];
      continue;
    }
    const activeDt = Math.min(
      dt,
      Math.max(
        0,
        battle.elapsed -
          Math.max(defender.spawnedAt + SKELETON_TRAP.spawnIdle, defender.stunnedUntil ?? 0),
      ),
    );
    if (activeDt <= 0) continue;
    const stats = lateDefenderStats(
        battle,
        defender,
        skeletonStats(defender.mode, defender.spawnLevel),
      ),
      eligible = (u: Unit) =>
        u.hp > 0 && !untargetable(battle, u) && !!TROOPS[u.kind].flying === stats.flying;
    // The current target if still eligible, else the nearest (then lowest id): the winner of
    // the old filter + full sort, found in one scan.
    let target: Unit | undefined;
    let nearest: Unit | undefined;
    let nearestDist = Infinity;
    for (const u of battle.units) {
      if (!eligible(u)) continue;
      if (u.id === defender.target) {
        target = u;
        break;
      }
      const dist = distance2D(u.x - defender.x, u.y - defender.y);
      if (
        nearest === undefined ||
        dist < nearestDist ||
        (dist === nearestDist && u.id < nearest.id)
      ) {
        nearest = u;
        nearestDist = dist;
      }
    }
    target ??= nearest;
    const wasAvoiding = !!defender.avoidingPoison;
    delete defender.avoidingPoison;
    const poison = defenderPoisonScales(battle, defender);
    const frost = defenderFrostScales(defender, battle.elapsed);
    const moveDt = activeDt * poison.move * frost.move;
    const cooling = defender.cooldown > 0;
    defender.cooldown -= activeDt * poison.attack * frost.attack;
    defender.pathAt -= activeDt;
    if (!target) {
      defender.target = null;
      const escape = poisonAvoidanceTarget(battle, defender);
      if (escape) {
        defender.avoidingPoison = true;
        if (stats.flying) defender.path = [escape];
        else if (!wasAvoiding || !defender.path.length || defender.pathAt <= 0) {
          defender.path = findPath(
            defender,
            escape,
            (structures ??= buildingsAtStart.filter((building) => building.kind !== 'wall')),
            0.1,
            !!battle.nativeSubtiles,
          );
          defender.pathAt = 0.3;
        }
        moveAlong(defender, stats.speed, moveDt);
      } else defender.path = [];
      continue;
    }
    if (wasAvoiding) {
      defender.path = [];
      defender.pathAt = 0;
    }
    if (defender.target !== target.id) {
      defender.target = target.id;
      defender.path = [];
      defender.pathAt = 0;
    }
    const distance = distance2D(target.x - defender.x, target.y - defender.y);
    if (distance <= stats.range + 1e-6) {
      defender.attacking = true;
      if (defender.cooldown <= 0) {
        defender.cooldown = Math.max(0, stats.rate + (cooling ? defender.cooldown : 0));
        defender.alerted = true;
        hurtUnit(battle, target, stats.damage);
        effect({
          type: 'hit',
          sourceDefender: true,
          sourceId: defender.id,
          targetId: target.id,
          x: defender.x,
          y: defender.y,
          toX: target.x,
          toY: target.y,
          fromAir: stats.flying,
          toAir: stats.flying,
        });
      }
    } else if (stats.flying) {
      const move = Math.min(stats.speed * moveDt, distance);
      defender.x += ((target.x - defender.x) / distance) * move;
      defender.y += ((target.y - defender.y) / distance) * move;
    } else {
      if (!defender.path.length || defender.pathAt <= 0) {
        defender.path = findPath(
          defender,
          target,
          (structures ??= buildingsAtStart.filter((b) => b.kind !== 'wall')),
          stats.range,
          !!battle.nativeSubtiles,
        );
        defender.pathAt = 0.3;
      }
      moveAlong(defender, stats.speed, moveDt);
    }
  }
  // Campaign garrisons: poison applied by defending Headhunters ticks after every defender acted.
  if (battle.defenders?.length) stepGarrisonStatus(battle);
}
/** Targeting traits; native roster units pass their client-derived values instead of TROOPS. */
export type DefenderFightTraits = Pick<
  TroopDef,
  'prefersDefenses' | 'prefersResources' | 'healer' | 'wallBreaker' | 'flying' | 'splash'
> & {
  airTargets?: boolean;
  preferHeroes?: boolean;
  heroDamageScale?: number;
  /** Poison Lizard prefers nearby enemy units even when they have not engaged. */
  seekUnalerted?: boolean;
  nativeProjectile?: CombatProjectile['native'];
  /** Radius of a source-backed melee area hit; never grants air targeting. */
  nativeMeleeSplash?: number;
  /** Ground burrowers move directly below obstacles without becoming airborne. */
  underground?: boolean;
  /** A source hit without a projectile, including ranged or flying Heroes. */
  nativeDirectHit?: boolean;
  /** Fraction of the primary target's max HP, added after attack damage boosts. */
  nativeTargetHpBonus?: number;
};
const canFight = (unit: Unit, enemy: Defender, troop: DefenderFightTraits) =>
  !troop.healer &&
  !troop.wallBreaker &&
  !(troop.seekUnalerted && enemy.kind === 'repairer') &&
  (enemy.mode === 'ground' ||
    (troop.airTargets ??
      (unit.kind === 'archer' || unit.kind === 'wizard' || unit.kind === 'dragon')));
type AttackStats = Pick<TroopDef, 'damage' | 'speed' | 'range' | 'rate'>;
/** Routing shared with the building chase: wall index, Jump breaches, A* budget. */
export interface DefenderRoute {
  buildings: Building[];
  /** Native jumpers route without walls and never attack one on the chase. */
  jumpWalls?: boolean;
  wallTile?: Map<number, Building>;
  passableWalls?: Set<number>;
  budget?: { count: number; limit: number };
  breaches?: readonly { x: number; y: number }[];
  /** Prepare native targetability before a unit can strike its chosen defender. */
  enterRange?(): void;
}
/** Hero hunters ignore alert distance and ordinary defenders while a valid Hero remains. */
function preferredHeroTarget(battle: Battle, unit: Unit, troop: DefenderFightTraits) {
  let best: Defender | undefined;
  let bestDist = Infinity;
  for (const defender of battle.defenders ?? []) {
    if (
      defender.kind !== 'hero' ||
      defender.hp <= 0 ||
      defender.spawnedAt > battle.elapsed ||
      !canFight(unit, defender, troop) ||
      lateDefenderHidden(battle, defender) ||
      !garrisonDefenderTargetable(battle, defender)
    )
      continue;
    if (defender.id === unit.defenderTarget) return defender;
    const dist = distance2D(defender.x - unit.x, defender.y - unit.y);
    if (dist < bestDist || (dist === bestDist && defender.id > best!.id)) {
      best = defender;
      bestDist = dist;
    }
  }
  return best;
}
/** Min-scan: identical winner to the old filter+sort (distance, then larger id). */
function nearestAlertedDefender(battle: Battle, unit: Unit, troop: DefenderFightTraits) {
  let bestDist = Infinity;
  let best: Defender | undefined;
  for (const d of battle.defenders ?? []) {
    if (
      d.hp <= 0 ||
      ((d.kind !== 'skeleton' || troop.seekUnalerted) && d.spawnedAt > battle.elapsed) ||
      (!d.alerted && !troop.seekUnalerted) ||
      !canFight(unit, d, troop) ||
      lateDefenderHidden(battle, d) ||
      !garrisonDefenderTargetable(battle, d)
    )
      continue;
    const dist = distance2D(d.x - unit.x, d.y - unit.y);
    if (dist > SKELETON_TRAP.alertRadius) continue;
    if (best === undefined || dist < bestDist || (dist === bestDist && d.id > best.id)) {
      best = d;
      bestDist = dist;
    }
  }
  return best;
}
/**
 * Per-list index for the preferred-building exits: the buildings that can ever match each
 * preference, and ids for the committed-target lookup. Callers rebuild their lists every
 * tick and pass a per-tick targetability closure, so an index keyed by both lives one tick.
 * Hit points and the live predicates are still read at every use.
 */
interface PreferenceIndex {
  battle: Battle;
  targetable: (b: Building) => boolean;
  length: number;
  defenses: Building[];
  resources: Building[];
  byId: Map<number, Building> | null;
}
const preferenceIndexes = new WeakMap<readonly Building[], PreferenceIndex>();
function preferenceIndex(
  battle: Battle,
  buildings: Building[],
  targetable: (b: Building) => boolean,
): PreferenceIndex {
  const known = preferenceIndexes.get(buildings);
  if (
    known &&
    known.targetable === targetable &&
    known.battle === battle &&
    known.length === buildings.length
  )
    return known;
  const weapons = battle.late?.goblinBuildings?.weapons,
    huts = battle.late?.builderHut?.huts;
  const defenses: Building[] = [],
    resources: Building[] = [];
  let byId: Map<number, Building> | null = new Map();
  for (const b of buildings) {
    // Weapon and hut entries are created by the late phases, never inside the unit loop.
    if (isDefense(b.kind) || (battle.late && (weapons?.[b.id] || huts?.[b.id]))) defenses.push(b);
    if (isResourceBuilding(b.kind) && b.npc !== 'goblin-castle') resources.push(b);
    if (byId) {
      if (byId.has(b.id)) byId = null;
      else byId.set(b.id, b);
    }
  }
  const index = { battle, targetable, length: buildings.length, defenses, resources, byId };
  preferenceIndexes.set(buildings, index);
  return index;
}
/** Whether a preferred building still stands, or the unit's own building target does. */
function preferredOrCommitted(
  battle: Battle,
  unit: Unit,
  troop: DefenderFightTraits,
  buildings: Building[],
  targetable: (b: Building) => boolean,
) {
  const index = preferenceIndex(battle, buildings, targetable);
  if (troop.prefersDefenses)
    for (const b of index.defenses)
      if (b.hp > 0 && targetable(b) && (isDefense(b.kind) || lateActivatedDefense(battle, b)))
        return true;
  if (troop.prefersResources)
    for (const b of index.resources) if (b.hp > 0 && targetable(b)) return true;
  if (index.byId) {
    const committed = typeof unit.target === 'number' ? index.byId.get(unit.target) : undefined;
    return !!committed && committed.hp > 0 && targetable(committed);
  }
  for (const b of buildings) if (b.id === unit.target && b.hp > 0 && targetable(b)) return true;
  return false;
}
export function stepAttackerVsDefenders(
  battle: Battle,
  unit: Unit,
  stats: AttackStats,
  dt: number,
  buildings: Building[],
  damage: (b: Building, power: number) => void,
  effect: (fx: FX) => void,
  traits?: DefenderFightTraits,
  /** Per-tick targetability with hp checked live; defaults to targetableBuilding. */
  isTargetable?: (b: Building) => boolean,
  /** Routing shared with the building chase: wall index, Jump breaches, A* budget. */
  route?: DefenderRoute,
) {
  const troop: DefenderFightTraits = traits ?? TROOPS[unit.kind];
  const targetable = isTargetable ?? ((b: Building) => targetableBuilding(battle, b));
  if (troop.healer || troop.wallBreaker) {
    delete unit.defenderTarget;
    return false;
  }
  // Early-return when no defenders exist before scanning all buildings twice.
  // Mirrors the no-target branch below: a stale defenderTarget also clears the
  // building target so the unit retargets instead of resuming its old route.
  if (
    !(battle.defenders ?? []).some(
      (d) => d.hp > 0 && (d.kind === 'skeleton' || d.spawnedAt <= battle.elapsed),
    )
  ) {
    if (unit.defenderTarget !== undefined) {
      delete unit.defenderTarget;
      unit.target = null;
      unit.path = [];
      unit.pathAt = 0;
    }
    return false;
  }
  // A troop that prefers defenses or resources ignores defenders while a preferred building
  // stands or while it is committed to its current building target. That answer only needs
  // computing when a defender could actually be engaged: an unengaged troop with no alerted
  // defender in reach returns here exactly as it would after the building checks.
  const wantsPreferred = !!troop.prefersDefenses || !!troop.prefersResources;
  const preferredHero = troop.preferHeroes ? preferredHeroTarget(battle, unit, troop) : undefined;
  let nearest: Defender | undefined;
  let searched = false;
  if (wantsPreferred && !preferredHero) {
    if (unit.defenderTarget === undefined) {
      nearest = nearestAlertedDefender(battle, unit, troop);
      searched = true;
      if (!nearest) return false;
    }
    if (preferredOrCommitted(battle, unit, troop, buildings, targetable)) {
      delete unit.defenderTarget;
      return false;
    }
  }
  let target =
    preferredHero ??
    (battle.defenders ?? []).find(
      (d) =>
        d.id === unit.defenderTarget &&
        d.hp > 0 &&
        ((d.kind === 'skeleton' && !troop.seekUnalerted) || d.spawnedAt <= battle.elapsed) &&
        canFight(unit, d, troop) &&
        !lateDefenderHidden(battle, d) &&
        garrisonDefenderTargetable(battle, d),
    );
  if (!target) {
    target = searched ? nearest : nearestAlertedDefender(battle, unit, troop);
    if (!target) {
      if (unit.defenderTarget !== undefined) {
        delete unit.defenderTarget;
        unit.target = null;
        unit.path = [];
        unit.pathAt = 0;
      }
      return false;
    }
  }
  if (unit.defenderTarget !== target.id) {
    unit.defenderTarget = target.id;
    unit.path = [];
    unit.pathAt = 0;
  }
  const distance = distance2D(unit.x - target.x, unit.y - target.y);
  if (distance <= stats.range + 1e-6) {
    unit.attacking = true;
    route?.enterRange?.();
    if (unit.cooldown <= 0) {
      unit.cooldown = stats.rate;
      const power =
        stats.damage * (target.kind === 'hero' ? (troop.heroDamageScale ?? 1) : 1) +
        target.maxHp * (troop.nativeTargetHpBonus ?? 0);
      if (unit.kind === 'dragon') {
        hurtDefender(battle, target, power);
        damageDefenders(battle, target, stats.damage, troop.splash ?? 0, target.mode, target.id);
        if (target.mode === 'ground')
          for (const b of buildings)
            if (b.hp > 0 && !isTrap(b.kind) && distanceTo(target, b) <= (troop.splash ?? 0))
              damage(b, stats.damage);
        effect({
          type: 'breath',
          targetDefender: true,
          targetId: target.id,
          sourceId: unit.id,
          x: unit.x,
          y: unit.y,
          toX: target.x,
          toY: target.y,
          fromAir: true,
          toAir: target.mode === 'air',
        });
      } else if (!troop.nativeDirectHit && (stats.range > 2 || troop.flying)) {
        launchProjectile(
          battle,
          {
            weapon: troop.nativeProjectile
              ? 'native'
              : troop.flying
                ? 'bomb'
                : unit.kind === 'wizard'
                  ? 'fireball'
                  : 'arrow',
            ...(troop.nativeProjectile ? { native: troop.nativeProjectile } : {}),
            sourceId: unit.id,
            targetId: target.id,
            targetBuilding: false,
            targetDefender: true,
            fromX: unit.x,
            fromY: unit.y,
            x: target.x,
            y: target.y,
            fromAir: troop.flying,
            toAir: target.mode === 'air',
            damage: power,
            splash: troop.splash,
          },
          effect,
        );
      } else {
        hurtDefender(battle, target, power);
        if (troop.nativeMeleeSplash && target.mode === 'ground') {
          const radius = troop.nativeMeleeSplash;
          damageDefenders(
            battle,
            target,
            stats.damage,
            radius,
            'ground',
            target.id,
            battle.elapsed,
          );
          for (const b of buildings)
            if (presentBuilding(battle, b) && distanceTo(target, b) <= radius)
              damage(b, stats.damage);
          effect({ type: 'blast', x: target.x, y: target.y, radius, sourceId: unit.id });
        }
        effect({
          type: 'hit',
          targetDefender: true,
          targetId: target.id,
          sourceId: unit.id,
          x: unit.x,
          y: unit.y,
          toX: target.x,
          toY: target.y,
        });
      }
    }
  } else if (troop.flying || troop.underground) {
    const move = Math.min(stats.speed * dt, distance);
    unit.x += ((target.x - unit.x) / distance) * move;
    unit.y += ((target.y - unit.y) / distance) * move;
  } else {
    if (!unit.path.length || unit.pathAt <= 0) {
      // Same per-tick A* budget as the building chase: defer overflow a tick
      // instead of spiking.
      if (route?.budget && route.budget.count >= route.budget.limit) {
        unit.pathAt = Math.min(Math.max(unit.pathAt, 0.05), 0.15);
      } else {
        if (route?.budget) route.budget.count++;
        // Defenders are troop points; leveled garrison defenders must not be read as footprints.
        unit.path = findPath(
          unit,
          { x: target.x, y: target.y },
          route?.buildings ?? buildings,
          stats.range,
          !!battle.nativeSubtiles,
          route?.breaches ?? [],
        );
        unit.pathAt = 0.3;
      }
    }
    const next = unit.path[0];
    // Jump-opened walls are walked over, not attacked. Index-only when the
    // caller shares its wall index; the linear scan survives only for
    // index-less contexts (tests).
    const hit =
      next === undefined
        ? undefined
        : (route?.wallTile?.get(Math.floor(next.y) * MAP_SIZE + Math.floor(next.x)) ??
          (!route?.wallTile
            ? buildings.find(
                (b) =>
                  b.kind === 'wall' &&
                  b.hp > 0 &&
                  b.x === Math.floor(next.x) &&
                  b.y === Math.floor(next.y),
              )
            : undefined));
    const wall =
      !route?.jumpWalls && hit && hit.hp > 0 && !route?.passableWalls?.has(hit.id)
        ? hit
        : undefined;
    if (wall && distanceTo(unit, wall) <= stats.range) {
      unit.attacking = true;
      if (unit.cooldown <= 0) {
        unit.cooldown = stats.rate;
        if (stats.range > 2) {
          launchProjectile(
            battle,
            {
              weapon: unit.kind === 'wizard' ? 'fireball' : 'arrow',
              sourceId: unit.id,
              targetId: wall.id,
              targetBuilding: true,
              fromX: unit.x,
              fromY: unit.y,
              x: wall.x + 0.5,
              y: wall.y + 0.5,
              damage: stats.damage,
              splash: troop.splash,
            },
            effect,
          );
        } else {
          damage(wall, stats.damage);
          effect({ type: 'hit', x: wall.x + 0.5, y: wall.y + 0.5 });
        }
      }
    } else moveAlong(unit, stats.speed, dt);
  }
  return true;
}
