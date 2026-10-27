import type { GuardianDefender } from './defenders';
import { guardianStats } from './native-guardians';

/** Native non-looping clips repeat with each windup and follow the slowed combat clock. */
export function guardianAttackAnimationTime(guardian: GuardianDefender) {
  if (guardian.clock === undefined || guardian.releaseAt === undefined) return 0;
  const { interval, windup } = guardianStats(guardian.guardian, guardian.level);
  if (interval <= 0) return 0;
  // On release, combat moves releaseAt forward by one interval. Modulo keeps the current
  // follow-through continuous, holds the clip's last frame, then starts the next windup.
  const age = guardian.clock - (guardian.releaseAt - windup);
  const phase = (age + 1e-9) % interval;
  return phase < 0 ? phase + interval : phase;
}
