import { BUILDINGS, TROOPS } from './data';
import { distance2D } from './distance';
import type { LateCombatContext, SpellTowerWeapon } from './late-campaign';
import type { Battle, Building, Unit } from './model';
import { SPELL_TOWER, SPELL_TOWER_HERO, speedPoints } from './spell-tower-stats';

/** Spell Tower: defensive Rage, Poison and Invisibility casts.
 * The campaign gate keeps affected villages unavailable until this is true. */
export const SPELL_TOWER_READY = false;

export interface SpellTowerCast {
  /** Stable cast order across every tower in this battle. */
  index: number;
  sourceId: number;
  weapon: SpellTowerWeapon;
  level: number;
  /** Bottle release: the end of the source hit timer, or the destruction time. */
  at: number;
  /** Bottle impact, `FixedTravelTime` later; the spell's first pulse is relative to this. */
  deployAt: number;
  fromX: number;
  fromY: number;
  /** Spell center: the tower (`SelfAsAoeCenter`) or the Poison target's position at release. */
  x: number;
  y: number;
  targetId: number | null;
  onDeath: boolean;
  /** Pulses already applied to moving units. Static buildings are evaluated from the schedule. */
  applied: number;
}
export interface SpellTowerTowerState {
  weapon: SpellTowerWeapon;
  targetId: number | null;
  /** Accumulated source hit timer toward `AttackSpeed - CoolDownOverride`. */
  windup: number;
  /** Battle time when the `CoolDownOverride` reload ends and a spell is loaded again. */
  readyAt: number;
  casts: number;
  lastCastAt?: number;
  destroyedAt?: number;
}
/** Battle-only state, reconstructed from the replay snapshot and simulation clock. */
export interface SpellTowerBattleState {
  towers: Record<number, SpellTowerTowerState>;
  casts: SpellTowerCast[];
  /** Next 64-ms hitpoint-component tick used for poison damage and decay. */
  poisonTick: number;
  /** Defending units enraged by a pulse: id → boost end. */
  defenderRage: Record<number, number>;
  /** Defending units concealed by a pulse: id → concealment end. */
  defenderHidden: Record<number, number>;
}
/** Per-attacker status owned by this family. */
export interface SpellTowerUnitState {
  poisonDps: number;
  /** Source poison intensity from 0 to 1000. */
  poisonTime: number;
  /** Milliseconds of full intensity before the per-tick decay starts. */
  poisonHold: number;
  /** Movement and attack slow end (battle seconds), linked to the remaining poison. */
  slowUntil: number;
}

const POISON_TICK = 0.064;
const NEUTRAL = Object.freeze({ damage: 1, rate: 1 });
const center = (tower: Building) => ({
  x: tower.x + BUILDINGS.spelltower.size / 2,
  y: tower.y + BUILDINGS.spelltower.size / 2,
});
const buildingCenter = (building: Building) => ({
  x: building.x + BUILDINGS[building.kind].size / 2,
  y: building.y + BUILDINGS[building.kind].size / 2,
});
/** Client area test: inside the bounding square and strictly inside the radius. */
const inside = (dx: number, dy: number, radius: number) =>
  Math.abs(dx) <= radius && Math.abs(dy) <= radius && dx * dx + dy * dy < radius * radius;
const active = (unit: Unit, at: number) =>
  unit.hp > 0 && !unit.ejected && (unit.spawnedAt ?? 0) <= at;
const lastPulseAt = (cast: SpellTowerCast) => {
  const spell = SPELL_TOWER[cast.weapon].spell;
  return cast.deployAt + spell.firstHit + (spell.hits - 1) * spell.interval;
};
const firstPulseAt = (cast: SpellTowerCast) =>
  cast.deployAt + SPELL_TOWER[cast.weapon].spell.firstHit;

function familyState(battle: Battle): SpellTowerBattleState {
  return ((battle.late ??= {}).spellTower ??= {
    towers: {},
    casts: [],
    poisonTick: Math.floor(battle.elapsed / POISON_TICK + 1e-9) + 1,
    defenderRage: {},
    defenderHidden: {},
  });
}
export function spellTowerState(battle: Battle, tower: Building): SpellTowerTowerState {
  return (familyState(battle).towers[tower.id] ??= {
    weapon: tower.spellTowerWeapon ?? 'rage',
    targetId: null,
    windup: 0,
    readyAt: 0,
    casts: 0,
  });
}
export function spellTowerUnitState(unit: Unit): SpellTowerUnitState {
  return ((unit.late ??= {}).spellTower ??= {
    poisonDps: 0,
    poisonTime: 0,
    poisonHold: 0,
    slowUntil: 0,
  });
}

function cast(battle: Battle, tower: Building, at: number, target: Unit | undefined, onDeath: boolean) {
  const weapon = tower.spellTowerWeapon!;
  const stats = SPELL_TOWER[weapon];
  const family = familyState(battle),
    state = spellTowerState(battle, tower),
    from = center(tower);
  const point = stats.selfCentered || !target ? from : { x: target.x, y: target.y };
  family.casts.push({
    index: family.casts.length + 1,
    sourceId: tower.id,
    weapon,
    level: tower.level,
    at,
    deployAt: at + stats.projectile.travel,
    fromX: from.x,
    fromY: from.y,
    x: point.x,
    y: point.y,
    targetId: target?.id ?? null,
    onDeath,
    applied: 0,
  });
  state.casts++;
  state.lastCastAt = at;
  state.readyAt = at + stats.cooldown;
  state.windup = 0;
}

/** Attackers whose current attack lands on a damaged building inside the Invisibility area. */
function attacksBuildingInside(battle: Battle, tower: Building, unit: Unit) {
  if (!unit.attacking || unit.defenderTarget !== undefined || unit.target === null) return false;
  const building = battle.buildings.find((b) => b.id === unit.target);
  if (!building || building.kind === 'wall' || building.hp <= 0 || building.hp >= building.maxHp)
    return false;
  const c = center(tower),
    b = buildingCenter(building),
    size = BUILDINGS[building.kind].size;
  const reach = distance2D(
    Math.max(building.x - unit.x, 0, unit.x - building.x - size),
    Math.max(building.y - unit.y, 0, unit.y - building.y - size),
  );
  return (
    inside(b.x - c.x, b.y - c.y, SPELL_TOWER[tower.spellTowerWeapon!].spell.radius) &&
    reach <= TROOPS[unit.kind].range + 1e-6
  );
}

/**
 * The source weapon's hit timer accumulates while a target stays engaged after the reload,
 * and a cast restarts the reload. Rage and Poison engage any attacker in `AttackRange`;
 * Invisibility (`CustomTargetHitBuildingInRange`) engages an attacker hitting a damaged
 * building inside its area and keeps that attacker while it lives.
 */
function stepTowers({ battle, dt }: LateCombatContext) {
  const start = battle.elapsed - dt;
  for (const tower of battle.buildings) {
    if (tower.kind !== 'spelltower' || !tower.spellTowerWeapon) continue;
    const state = spellTowerState(battle, tower),
      stats = SPELL_TOWER[tower.spellTowerWeapon];
    if (tower.hp <= 0 || tower.constructing || tower.upgradeEnd) {
      state.targetId = null;
      state.windup = 0;
      continue;
    }
    const stunEnd = battle.defenseStuns[tower.id] ?? 0;
    const stunned = Math.max(0, Math.min(battle.elapsed, stunEnd) - start);
    if (stunned > 0) {
      if (state.readyAt > start) state.readyAt += stunned;
      state.windup = 0;
      state.targetId = null;
      if (stunEnd >= battle.elapsed) continue;
    }
    const c = center(tower);
    const eligible = (unit: Unit) =>
      active(unit, battle.elapsed) &&
      (TROOPS[unit.kind].flying ? stats.airTargets : stats.groundTargets);
    const inRange = (unit: Unit) =>
      eligible(unit) &&
      (stats.hitBuildingTrigger
        ? attacksBuildingInside(battle, tower, unit)
        : distance2D(unit.x - c.x, unit.y - c.y) <= stats.range + 1e-9);
    const retained = battle.units.find(
      (u) =>
        u.id === state.targetId &&
        (stats.hitBuildingTrigger ? eligible(u) : inRange(u)),
    );
    const target =
      retained ??
      battle.units
        .filter(inRange)
        .sort(
          (a, b) =>
            distance2D(a.x - c.x, a.y - c.y) - distance2D(b.x - c.x, b.y - c.y) || a.id - b.id,
        )[0];
    if (!target) {
      state.targetId = null;
      state.windup = 0;
      continue;
    }
    const continuing = state.targetId !== null;
    state.targetId = target.id;
    if (!continuing) continue;
    const from = Math.max(start, state.readyAt, stunEnd);
    if (from > battle.elapsed + 1e-9) continue;
    const at = from + stats.windup - state.windup;
    if (at > battle.elapsed + 1e-9) state.windup += battle.elapsed - from;
    else cast(battle, tower, at, target, false);
  }
}

function applyPulse(battle: Battle, family: SpellTowerBattleState, entry: SpellTowerCast, at: number) {
  const spell = SPELL_TOWER[entry.weapon].spell;
  if (entry.weapon === 'poison') {
    for (const unit of battle.units) {
      if (!active(unit, at) || (TROOPS[unit.kind].flying && !spell.poisonAffectAir)) continue;
      if (!inside(entry.x - unit.x, entry.y - unit.y, spell.radius)) continue;
      const status = spellTowerUnitState(unit);
      // LogicHitpointComponent.SetPoisonDamage: keep the strongest poison at full intensity.
      const dps = unit.hero ? spell.poisonDps * spell.heroDamageMultiplier : spell.poisonDps;
      status.poisonDps = Math.max(status.poisonDps, dps);
      status.poisonTime = 1000;
      status.poisonHold = 640;
      // BoostLinkedToPoison extends the slow to the complete remaining poison time.
      const remaining = spell.boostLinkedToPoison
        ? (status.poisonHold + (status.poisonTime * 64) / 10) / 1000
        : 0;
      status.slowUntil = at + Math.max(spell.boostTime, remaining);
    }
    return;
  }
  const until = at + (entry.weapon === 'rage' ? spell.boostTime : spell.invisibilityTime);
  const record = entry.weapon === 'rage' ? family.defenderRage : family.defenderHidden;
  for (const defender of battle.defenders ?? []) {
    if (defender.hp <= 0 || defender.spawnedAt > at) continue;
    if (!inside(entry.x - defender.x, entry.y - defender.y, spell.radius)) continue;
    record[defender.id] = Math.max(record[defender.id] ?? 0, until);
  }
}

function poisonTick(battle: Battle) {
  for (const unit of battle.units) {
    const status = unit.late?.spellTower;
    if (!status || (status.poisonTime <= 0 && status.poisonHold <= 0) || unit.hp <= 0) continue;
    if (status.poisonHold > 0) status.poisonHold = Math.max(0, status.poisonHold - 64);
    else {
      status.poisonTime -= 10;
      if (status.poisonTime <= 0) {
        status.poisonTime = 0;
        status.poisonDps = 0;
      }
    }
    if (status.poisonTime > 0)
      unit.hp -= (status.poisonDps * status.poisonTime * POISON_TICK) / 1000;
  }
}

/** Pulses and 64-ms poison ticks resolve in battle-time order before attackers act. */
function stepAuras({ battle }: LateCombatContext) {
  const family = battle.late?.spellTower;
  if (!family) return;
  for (;;) {
    let next: SpellTowerCast | undefined,
      nextAt = Infinity;
    for (const entry of family.casts) {
      const spell = SPELL_TOWER[entry.weapon].spell;
      if (entry.applied >= spell.hits) continue;
      const at = entry.deployAt + spell.firstHit + entry.applied * spell.interval;
      if (at < nextAt) {
        next = entry;
        nextAt = at;
      }
    }
    const tickAt = family.poisonTick * POISON_TICK;
    if (next && nextAt <= battle.elapsed + 1e-9 && nextAt <= tickAt + 1e-9) {
      applyPulse(battle, family, next, nextAt);
      next.applied++;
    } else if (tickAt <= battle.elapsed + 1e-9) {
      poisonTick(battle);
      family.poisonTick++;
    } else break;
  }
}

export function stepSpellTower(context: LateCombatContext) {
  if (context.phase === 'auras') stepAuras(context);
  else if (context.phase === 'defenses') stepTowers(context);
}
/** True while a spell bottle is still in flight toward its impact. */
export function spellTowerPending(battle: Battle) {
  return !!battle.late?.spellTower?.casts.some((entry) => entry.deployAt > battle.elapsed + 1e-9);
}
/** `AttackCenterOnDeath`: a loaded tower releases its spell when destroyed. */
export function spellTowerDestroyed(context: LateCombatContext, building: Building, at: number) {
  if (building.kind !== 'spelltower' || !building.spellTowerWeapon) return;
  const battle = context.battle,
    state = spellTowerState(battle, building),
    stats = SPELL_TOWER[building.spellTowerWeapon];
  if (state.destroyedAt !== undefined) return;
  state.destroyedAt = at;
  const loaded = at + 1e-9 >= state.readyAt,
    engaged = state.targetId;
  state.targetId = null;
  state.windup = 0;
  if (!stats.castOnDeath || !loaded) return;
  const c = center(building);
  // Poison seeks its engaged or nearest attacker in range; with none it lands on the tower.
  const target = stats.selfCentered
    ? undefined
    : (battle.units.find((u) => u.id === engaged && active(u, at)) ??
      battle.units
        .filter(
          (u) =>
            active(u, at) &&
            (TROOPS[u.kind].flying ? stats.airTargets : stats.groundTargets) &&
            distance2D(u.x - c.x, u.y - c.y) <= stats.range + 1e-9,
        )
        .sort(
          (a, b) =>
            distance2D(a.x - c.x, a.y - c.y) - distance2D(b.x - c.x, b.y - c.y) || a.id - b.id,
        )[0]);
  cast(battle, building, at, target, true);
}

/** Rage: multipliers for a defense's damage and firing rate at the given battle time.
 * `BuildingDamageBoostPercent` scales primary damage; the source spell has no attack-speed boost. */
export function spellTowerDefenseBoost(battle: Battle, building: Building, at = battle.elapsed) {
  const casts = battle.late?.spellTower?.casts;
  if (!casts?.length) return NEUTRAL;
  const b = buildingCenter(building);
  for (const entry of casts) {
    if (entry.weapon !== 'rage') continue;
    const spell = SPELL_TOWER.rage.spell;
    if (at + 1e-9 < firstPulseAt(entry) || at >= lastPulseAt(entry) + spell.boostTime) continue;
    if (inside(entry.x - b.x, entry.y - b.y, spell.radius))
      return { damage: 1 + spell.buildingDamageBoost, rate: 1 };
  }
  return NEUTRAL;
}
/** Invisibility: buildings that attackers can neither target nor select as a destination. */
export function spellTowerHidden(battle: Battle, building: Building, at = battle.elapsed) {
  const casts = battle.late?.spellTower?.casts;
  if (!casts?.length || building.kind === 'wall') return false;
  const b = buildingCenter(building);
  return casts.some((entry) => {
    if (entry.weapon !== 'invisibility') return false;
    const spell = SPELL_TOWER.invisibility.spell;
    return (
      at + 1e-9 >= firstPulseAt(entry) &&
      at < lastPulseAt(entry) + spell.invisibilityTime &&
      inside(entry.x - b.x, entry.y - b.y, spell.radius)
    );
  });
}
/** Poison: fraction of normal attack-timer progress an attacker receives (`AttackSpeedBoost`). */
export function spellTowerTimeScale(battle: Battle, unit: Unit) {
  if (!battle.late?.spellTower) return 1;
  const status = unit.late?.spellTower;
  if (!status || status.slowUntil <= battle.elapsed) return 1;
  return 1 + SPELL_TOWER.poison.spell.attackSpeedBoost;
}
/** Poison: fraction of normal movement (`SpeedBoost`; Heroes use HERO_RAGE_SPEED_MULTIPLIER). */
export function spellTowerMoveScale(battle: Battle, unit: Unit) {
  if (!battle.late?.spellTower) return 1;
  const status = unit.late?.spellTower;
  if (!status || status.slowUntil <= battle.elapsed) return 1;
  const spell = SPELL_TOWER.poison.spell;
  const points = TROOPS[unit.kind].prefersDefenses || TROOPS[unit.kind].prefersResources || TROOPS[unit.kind].wallBreaker
    ? spell.speedBoost2
    : spell.speedBoost;
  return 1 + (unit.hero ? Math.trunc(points * SPELL_TOWER_HERO.speed) : points) / 100;
}
/** Rage on defending units: damage multiplier and added movement speed in tiles per second. */
export function spellTowerDefenderBoost(
  battle: Battle,
  defender: { id: number; kind: string },
  at = battle.elapsed,
) {
  const until = battle.late?.spellTower?.defenderRage[defender.id];
  if (until === undefined || until <= at) return { damage: 1, speed: 0 };
  const spell = SPELL_TOWER.rage.spell;
  // Balloons retain a preferred target class, which selects `SpeedBoost2`.
  const points = defender.kind === 'balloon' ? spell.speedBoost2 : spell.speedBoost;
  return { damage: 1 + spell.damageBoost, speed: speedPoints(points) };
}
/** Invisibility on defending units: attackers cannot select them while concealed. */
export function spellTowerDefenderHidden(battle: Battle, defender: { id: number }) {
  const until = battle.late?.spellTower?.defenderHidden[defender.id];
  return until !== undefined && until > battle.elapsed;
}
