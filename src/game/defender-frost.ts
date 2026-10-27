import type { Defender } from './defenders';

export interface DefenderFrost {
  until: number;
  percent: number;
}

/** A ranged frost hit carries its launch-time values, even after its owner leaves. */
export function applyDefenderFrost(
  defender: Defender,
  frost: { seconds: number; percent: number },
  at: number,
) {
  if (
    defender.hp <= 0 ||
    defender.kind === 'repairer' ||
    defender.spawnedAt > at + 1e-9 ||
    frost.seconds <= 0 ||
    frost.percent <= 0
  )
    return;
  // Match the existing building frost path: the latest hit replaces its frost deadline.
  defender.frost = { until: at + frost.seconds, percent: frost.percent };
}

const NEUTRAL = Object.freeze({ move: 1, attack: 1 });

/** Same local movement/attack interpretation as native attacking-unit chill. */
export function defenderFrostScales(defender: Defender, at: number) {
  const frost = defender.frost;
  if (!frost || frost.until <= at + 1e-9) return NEUTRAL;
  return {
    move: Math.max(0, 1 - frost.percent),
    attack: Math.max(0.05, 1 - frost.percent),
  };
}
