import { nativeRow, num, text, tiles } from './native-data';
import type { NativeUnitStats } from './native-units';
import type { Unit } from './model';

interface LongShot {
  count: number;
  range: number;
  projectile: string;
}
const profiles = new Map<string, LongShot>();

/** Offensive source ability; the separate defensive substitution keeps its own three shots. */
export function superMinionLongShot(stats: NativeUnitStats): LongShot | undefined {
  if (stats.name !== 'Super Minion' || !stats.ability) return undefined;
  const key = `${stats.ability}:${stats.abilityLevel}`;
  let profile = profiles.get(key);
  if (!profile) {
    const row = nativeRow('abilities', stats.ability, stats.abilityLevel);
    profile = {
      count: num(row, 'DeactivateAfterNumberOfHits'),
      range: tiles(row, 'AttackRange'),
      projectile: text(row, 'Projectile'),
    };
    profiles.set(key, profile);
  }
  return profile;
}

/** Count physical releases, including shots still in flight, across all target changes. */
export function superMinionAttackStats(stats: NativeUnitStats, attacks: number) {
  const opening = superMinionLongShot(stats);
  return opening && attacks < opening.count
    ? { ...stats, range: opening.range, projectile: opening.projectile }
    : stats;
}

/** Exhausting Long Shot ends its engagement; normal-range routing starts a fresh charge. */
export function finishSuperMinionOpening(unit: Unit, stats: NativeUnitStats) {
  const opening = superMinionLongShot(stats),
    windup = unit.native?.attackWindup;
  if (!opening || unit.native?.attacks !== opening.count || !windup) return;
  delete windup.engaged;
  delete windup.target;
  delete windup.animationOffset;
}
