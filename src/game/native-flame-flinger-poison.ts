import type { Battle, Building } from './model';
import { flag, num, seconds, type NativeRow } from './native-data';
import { buildingEffects } from './native-status';

/** The defender-poison allowance, applied to a building's shared Flame Flinger exposure. */
export function flameFlingerPoisonDamage(
  battle: Battle,
  building: Building,
  row: NativeRow,
  at: number,
  tick: number,
) {
  const state = (buildingEffects(battle, building).flameBurn ??= { since: at, until: at });
  const active = state.until > at;
  if (state.until + 6 < at) state.since = at;
  state.until = Math.max(state.until, at + Math.max(seconds(row, 'BoostTimeMS'), tick));
  const ramp = flag(row, 'PoisonIncreaseSlowly') ? Math.min(1, (at - state.since + tick) / 5) : 1,
    dps = num(row, 'PoisonDPS'),
    old = active ? state.damage : undefined,
    maximum = Math.max(dps, old?.dps ?? 0),
    cap = maximum * tick,
    budget = Math.min(
      cap,
      old ? old.budget + Math.max(0, at - old.at) * maximum + Math.max(0, cap - old.cap) : cap,
    ),
    damage = Math.min(dps * tick * ramp, budget);
  state.damage = { at: Math.max(at, old?.at ?? at), budget: budget - damage, cap, dps: maximum };
  return damage;
}
