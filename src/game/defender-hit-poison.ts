import { flag, nativeGlobal, nativeRow, num, seconds, text } from './native-data';
import type { NativeUnitStats } from './native-units';
import type { Defender } from './defenders';

export interface NativeHitPoison {
  spell: string;
  level: number;
  duration: number;
  dps: number;
  heroDamageScale: number;
  guardianDamageScale: number;
  speed: number;
  attack: number;
  affectsAir: boolean;
}
export interface DefenderHitPoison {
  spell: string;
  level: number;
  from: number;
  until: number;
  ticked: number;
  /** Source DPS after the struck class's Hero/Guardian modifier. */
  dps: number;
  speed: number;
  attack: number;
}
const sources = new WeakMap<NativeUnitStats, NativeHitPoison | null>();

/** Intrinsic poison-on-hit abilities, retained in the projectile's source kind and level. */
export function nativeHitPoison(stats: NativeUnitStats): NativeHitPoison | undefined {
  if (sources.has(stats)) return sources.get(stats) ?? undefined;
  for (const ability of stats.abilities) {
    const row = nativeRow('abilities', ability.name, ability.level);
    const name = text(row, 'PoisonOnHitSpell');
    const duration = seconds(row, 'PoisonOnHitDuration');
    if (!name || duration <= 0) continue;
    const level = num(row, 'PoisonOnHitSpellLevel', 1);
    const spell = nativeRow('spells', name, level);
    const poison = {
      spell: name,
      level,
      duration,
      dps: Math.max(0, num(spell, 'PoisonDPS')),
      heroDamageScale: num(spell, 'HeroDamageMultiplier', 100) / 100,
      guardianDamageScale:
        num(
          spell,
          'GuardianDamageMultiplier',
          nativeGlobal('GUARDIAN_POISON_SPEED_MULTIPLIER', 100),
        ) / 100,
      speed: Math.min(0, num(spell, 'SpeedBoost')) / 100,
      attack: Math.min(0, num(spell, 'AttackSpeedBoost')) / 100,
      affectsAir: flag(spell, 'PoisonAffectAir'),
    };
    sources.set(stats, poison);
    return poison;
  }
  sources.set(stats, null);
  return undefined;
}

/** Same local continuous on-hit interpretation as defending Headhunters; area spells keep their ramp. */
export function tickDefenderHitPoison(defender: Defender, at: number) {
  const poison = defender.hitPoison;
  if (!poison) return;
  const end = Math.min(at, poison.until);
  if (defender.hp > 0 && end > poison.ticked && poison.dps > 0) {
    const hp = defender.hp;
    defender.hp = Math.max(0, hp - poison.dps * (end - poison.ticked));
    if (defender.hp <= 0) {
      defender.defeatedAt = poison.ticked + hp / poison.dps;
      defender.attacking = false;
    }
  }
  poison.ticked = Math.max(poison.ticked, end);
  if (at >= poison.until || defender.hp <= 0) delete defender.hitPoison;
}

export function applyDefenderHitPoison(defender: Defender, poison: NativeHitPoison, at: number) {
  if (
    defender.hp <= 0 ||
    defender.kind === 'repairer' ||
    defender.spawnedAt > at + 1e-9 ||
    (defender.mode === 'air' && !poison.affectsAir)
  )
    return;
  tickDefenderHitPoison(defender, at);
  if (defender.hp <= 0) return;
  const old = defender.hitPoison;
  const active = old && old.until > at;
  const dps =
    poison.dps *
    (defender.kind === 'hero'
      ? poison.heroDamageScale
      : defender.kind === 'guardian'
        ? poison.guardianDamageScale
        : 1);
  const strongest = active && old.dps >= dps ? old : poison;
  defender.hitPoison = {
    spell: strongest.spell,
    level: strongest.level,
    from: active ? old.from : at,
    until: Math.max(active ? old.until : at, at + poison.duration),
    ticked: active ? Math.max(old.ticked, at) : at,
    dps: Math.max(active ? old.dps : 0, dps),
    speed: Math.min(active ? old.speed : 0, poison.speed),
    attack: Math.min(active ? old.attack : 0, poison.attack),
  };
}

/** Strongest active slow; Guardian resistance is applied by its own action-clock path. */
export function defenderHitPoisonScales(defender: Defender, at: number, scale = 1) {
  const poison = defender.hitPoison;
  if (!poison || poison.until <= at) return undefined;
  return {
    move: Math.max(0, 1 + poison.speed * scale),
    attack: Math.max(0.05, 1 + poison.attack * scale),
  };
}
