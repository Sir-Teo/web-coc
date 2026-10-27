import type { Battle } from './model';
import type { Defender } from './defenders';
import { nativeGlobal, num, type NativeRow } from './native-data';
import { activeBoost } from './native-boost';
import { lateDefenderBoost, lateDefenderStats } from './late-campaign';
import { SPELL_SPEED_SCALE } from './spell-progression';

/** Preferred-target characters use SpeedBoost2; Heroes use their own multiplier instead. */
export function rageModifiers(row: NativeRow, hero: boolean, preferred: boolean) {
  const speed = num(row, !hero && preferred ? 'SpeedBoost2' : 'SpeedBoost');
  return {
    speed:
      (speed / SPELL_SPEED_SCALE) *
      (hero ? nativeGlobal('HERO_RAGE_SPEED_MULTIPLIER', 50) / 100 : 1),
    damage:
      (num(row, 'DamageBoostPercent') / 100) *
      (hero ? nativeGlobal('HERO_RAGE_MULTIPLIER', 50) / 100 : 1),
    attackSpeed: num(row, 'AttackSpeedBoost') / 100,
  };
}

/** Native and historical defensive Rage use the strongest damage and movement component. */
export function defenderRageStats<T extends { damage: number; speed: number }>(
  battle: Battle,
  defender: Defender,
  stats: T,
): T {
  if (!battle.nativeRageRules) return lateDefenderStats(battle, defender, stats);
  const legacy = lateDefenderBoost(battle, defender);
  const scale = defender.kind === 'hero' ? nativeGlobal('HERO_RAGE_MULTIPLIER', 50) / 100 : 1;
  const moveScale =
    defender.kind === 'hero' ? nativeGlobal('HERO_RAGE_SPEED_MULTIPLIER', 50) / 100 : 1;
  const boost = activeBoost(defender.boost, battle.elapsed);
  const damage = Math.max(1 + (legacy.damage - 1) * scale, 1 + (boost?.damage ?? 0));
  const speed = Math.max(legacy.speed * moveScale, boost?.speed ?? 0);
  return damage === 1 && speed === 0
    ? stats
    : { ...stats, damage: stats.damage * damage, speed: stats.speed + speed };
}
