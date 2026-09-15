import type { Battle, Building, Unit } from './model';

/**
 * Version 45+ timed effects. Every field is a battle-clock deadline so replays, seeking and
 * long frames resolve identically. Older recordings never create these records.
 */
export interface UnitEffects {
  frozenUntil?: number;
  stunUntil?: number;
  /** Partial freeze, such as the TH13 frost field, as a fraction of normal action speed lost. */
  chill?: { until: number; percent: number };
  /** Strongest active friendly boost; rage-like spells do not stack with each other. */
  boost?: { until: number; speed: number; damage: number; attackSpeed: number };
  /** Enemy poison slows and damages over time. */
  poison?: { until: number; speed: number; attackSpeed: number; dps: number; since: number };
  jumpUntil?: number;
  invisibleUntil?: number;
  shield?: { until: number; percent: number };
  /** Temporary health granted by life auras; damage consumes it before hitpoints. */
  extraHp?: { until: number; amount: number };
  immortalUntil?: number;
}
export interface BuildingEffects {
  frozenUntil?: number;
  stunUntil?: number;
  chill?: { until: number; percent: number };
  /** Attack slow applied by frost-on-hit troops. */
  frost?: { until: number; percent: number };
  boost?: { until: number; damage: number };
  invisibleUntil?: number;
  /** Earthquake strike count, for diminishing repeated quakes. */
  quakes?: number;
}

export const unitEffects = (unit: Unit): UnitEffects => ((unit.native ??= {}).effects ??= {});
export const buildingEffects = (battle: Battle, building: Pick<Building, 'id'>): BuildingEffects =>
  ((battle.buildingEffects ??= {})[building.id] ??= {});

/** Burrowed or invisible attackers cannot be chosen as targets; older battles never carry either state. */
export const unitHidden = (unit: Unit, at: number) =>
  !!unit.native &&
  (!!unit.native.burrowed || (unit.native.effects?.invisibleUntil ?? 0) > at + 1e-9);
/** Burrowed movers and units whose client row disables trap triggers pass over armed traps. */
export const unitTriggersTraps = (unit: Unit) => !unit.native?.burrowed && !unit.native?.noTraps;
export const unitFrozen = (unit: Unit, at: number) => {
  const e = unit.native?.effects;
  return !!e && ((e.frozenUntil ?? 0) > at + 1e-9 || (e.stunUntil ?? 0) > at + 1e-9);
};
export const unitInvisible = (unit: Unit, at: number) =>
  (unit.native?.effects?.invisibleUntil ?? 0) > at + 1e-9;
export const buildingDisabled = (
  battle: Battle,
  building: Pick<Building, 'id'>,
  at = battle.elapsed,
) => {
  const e = battle.buildingEffects?.[building.id];
  return !!e && ((e.frozenUntil ?? 0) > at + 1e-9 || (e.stunUntil ?? 0) > at + 1e-9);
};

/** Fraction of normal movement retained after chill, poison and boosts. */
export function unitSpeedScale(unit: Unit, at: number) {
  const e = unit.native?.effects;
  if (!e) return 1;
  if ((e.frozenUntil ?? 0) > at + 1e-9 || (e.stunUntil ?? 0) > at + 1e-9) return 0;
  let scale = 1;
  if (e.chill && e.chill.until > at + 1e-9) scale *= 1 - e.chill.percent;
  if (e.poison && e.poison.until > at + 1e-9) scale *= Math.max(0, 1 + e.poison.speed);
  return scale;
}
/** Extra tiles/second from rage and haste style boosts. */
export const unitSpeedBonus = (unit: Unit, at: number) => {
  const boost = unit.native?.effects?.boost;
  return boost && boost.until > at + 1e-9 ? boost.speed : 0;
};
export const unitDamageScale = (unit: Unit, at: number) => {
  const boost = unit.native?.effects?.boost;
  return boost && boost.until > at + 1e-9 ? 1 + boost.damage : 1;
};
/** Multiplier on the time between attacks. */
export function unitAttackIntervalScale(unit: Unit, at: number) {
  const e = unit.native?.effects;
  if (!e) return 1;
  let speed = 1;
  if (e.boost && e.boost.until > at + 1e-9) speed *= 1 + e.boost.attackSpeed;
  if (e.poison && e.poison.until > at + 1e-9) speed *= Math.max(0.05, 1 + e.poison.attackSpeed);
  if (e.chill && e.chill.until > at + 1e-9) speed *= Math.max(0.05, 1 - e.chill.percent);
  return 1 / speed;
}
export function buildingAttackIntervalScale(
  battle: Battle,
  building: Pick<Building, 'id'>,
  at: number,
) {
  const e = battle.buildingEffects?.[building.id];
  if (!e) return 1;
  let speed = 1;
  if (e.frost && e.frost.until > at + 1e-9) speed *= Math.max(0.05, 1 - e.frost.percent);
  if (e.chill && e.chill.until > at + 1e-9) speed *= Math.max(0.05, 1 - e.chill.percent);
  return 1 / speed;
}
export const buildingDamageScale = (battle: Battle, building: Pick<Building, 'id'>, at: number) => {
  const boost = battle.buildingEffects?.[building.id]?.boost;
  return boost && boost.until > at + 1e-9 ? 1 + boost.damage : 1;
};

/**
 * Central attacker damage. Without version 45 effects this is exactly `unit.hp -= amount`.
 * Returns the hitpoints actually removed.
 */
export function hurtUnit(battle: Battle, unit: Unit, amount: number, at = battle.elapsed) {
  if (!(amount > 0) || unit.hp <= 0) return 0;
  const state = battle.nativeRoster ? unit.native : undefined;
  const e = state?.effects;
  if (e) {
    if ((e.immortalUntil ?? 0) > at + 1e-9) return 0;
    if (e.shield && e.shield.until > at + 1e-9) amount *= Math.max(0, 1 - e.shield.percent);
    if (e.extraHp && e.extraHp.until > at + 1e-9 && e.extraHp.amount > 0) {
      const absorbed = Math.min(amount, e.extraHp.amount);
      e.extraHp.amount -= absorbed;
      amount -= absorbed;
    }
  }
  if (amount <= 0) return 0;
  if (state) state.damageTaken = (state.damageTaken ?? 0) + Math.min(amount, unit.hp);
  unit.hp -= amount;
  return amount;
}
export function healUnit(battle: Battle, unit: Unit, amount: number) {
  if (!(amount > 0) || unit.hp <= 0) return 0;
  const before = unit.hp;
  unit.hp = Math.min(unit.maxHp, unit.hp + amount);
  return unit.hp - before;
}
