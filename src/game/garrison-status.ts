import type { Battle, Unit } from './model';
import type { garrisonPoisonOnHit } from './garrison-kinds';

type PoisonOnHit = NonNullable<ReturnType<typeof garrisonPoisonOnHit>>;
/** Attacker status applied by campaign garrison defenders (`unit.late.garrison`). */
export interface GarrisonUnitState {
  poison?: {
    /** Start of the continuous poisoned interval; each hit extends `until`. */
    from: number;
    until: number;
    /** Poison damage has been applied through this battle time. */
    ticked: number;
    /** Damage per second, already scaled for Heroes by the spell's HeroDamageMultiplier. */
    dps: number;
    moveScale: number;
    attackScale: number;
    sourceId: number;
  };
}

/**
 * Headhunter hits apply the source PoisonOnHitSpell level for PoisonOnHitDuration. Local
 * interpretation: constant PoisonDPS for the duration, refreshed by each hit, with the spell's
 * SpeedBoost/AttackSpeedBoost percentages. The Poison spell's area ramp (PoisonIncreaseSlowly)
 * belongs to its repeated cloud pulses and is not applied to on-hit poison.
 */
export function applyGarrisonPoison(
  battle: Battle,
  unit: Unit,
  poison: PoisonOnHit,
  sourceId: number,
  at: number,
) {
  const state = ((unit.late ??= {}).garrison ??= {});
  const current = state.poison && state.poison.until >= at ? state.poison : undefined;
  state.poison = {
    from: current ? current.from : at,
    until: Math.max(current ? current.until : at, at + poison.duration),
    ticked: current ? current.ticked : at,
    dps: unit.hero ? poison.dps * poison.heroDamageScale : poison.dps,
    moveScale: poison.moveScale,
    attackScale: poison.attackScale,
    sourceId,
  };
}

/** Apply poison damage through the current battle time, once per interval. */
export function stepGarrisonStatus(battle: Battle) {
  for (const unit of battle.units) {
    const poison = unit.late?.garrison?.poison;
    if (!poison) continue;
    const end = Math.min(battle.elapsed, poison.until);
    if (unit.hp > 0 && end > poison.ticked)
      unit.hp = Math.max(0, unit.hp - poison.dps * (end - poison.ticked));
    poison.ticked = Math.max(poison.ticked, end);
    if (battle.elapsed >= poison.until) delete unit.late!.garrison!.poison;
  }
}

const NEUTRAL = Object.freeze({ move: 1, attack: 1 });
/** Movement and attack-timer scales for an attacker; neutral without an active poison. */
export function garrisonUnitScales(battle: Battle, unit: Unit): { move: number; attack: number } {
  const poison = unit.late?.garrison?.poison;
  if (!poison || battle.elapsed >= poison.until) return NEUTRAL;
  return { move: poison.moveScale, attack: poison.attackScale };
}
