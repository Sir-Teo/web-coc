import native from '../../reference/full-client/progression.json';
import type { SpellKind } from './data';

/** Home Village levels supported through TH8. Sources: docs/SPELL-PROGRESSION.md. */
export const MAX_SPELL_LEVEL = Math.max(...Object.values(native.spells).map((rows) => rows.length));
export const maxSpellLevel = (kind: SpellKind) => native.spells[kind].length;
interface SpellLevel {
  cost: number;
  seconds: number;
  laboratory: number;
  damage: number;
  heal: number;
  damageBoost: number;
  speedBoost: number;
}
const level = (
  cost: number,
  seconds: number,
  laboratory: number,
  damage = 0,
  heal = 0,
  damageBoost = 0,
  speedBoost = 0,
): SpellLevel => ({ cost, seconds, laboratory, damage, heal, damageBoost, speedBoost });

// Cost/time describe the destination level; CSV UpgradeCost/Time describe the next level.
export const SPELL_LEVELS: Record<SpellKind, readonly SpellLevel[]> = {
  lightning: [
    level(0, 0, 0, 150),
    level(50000, 7200, 1, 180),
    level(100000, 14400, 2, 210),
    level(200000, 21600, 3, 240),
    level(600000, 86400, 6, 270),
  ],
  heal: [
    level(0, 0, 0, 0, 15),
    level(75000, 10800, 2, 0, 20),
    level(150000, 21600, 4, 0, 25),
    level(300000, 43200, 5, 0, 30),
    level(900000, 86400, 6, 0, 35),
  ],
  rage: [
    level(0, 0, 0, 0, 0, 130, 20),
    level(400000, 21600, 3, 0, 0, 140, 22),
    level(800000, 43200, 4, 0, 0, 150, 24),
    level(1000000, 86400, 5, 0, 0, 160, 26),
    level(2000000, 172800, 6, 0, 0, 170, 28),
  ],
};
for (const kind of Object.keys(SPELL_LEVELS) as SpellKind[]) {
  const rows = native.spells[kind] as unknown as Record<string, string>[];
  for (let i = 5; i < rows.length; i++) {
    const row = rows[i],
      previous = rows[i - 1];
    const num = (r: Record<string, string>, k: string) => Number(r[k] || 0);
    SPELL_LEVELS[kind] = [
      ...SPELL_LEVELS[kind],
      level(
        num(previous, 'UpgradeCost'),
        num(previous, 'UpgradeTimeH') * 3600 +
          num(previous, 'UpgradeTimeD') * 86400 +
          num(previous, 'UpgradeTimeM') * 60,
        num(row, 'LaboratoryLevel'),
        Math.max(0, num(row, 'Damage')),
        Math.max(0, -num(row, 'Damage')),
        num(row, 'DamageBoostPercent'),
        num(row, 'SpeedBoost'),
      ),
    ];
  }
}
export const SPELL_PULSE_INTERVAL = 0.3;
export const HEAL_PULSES = 41;
export const RAGE_PULSES = 60;
export const RAGE_LINGER = 1;
export const HEAL_HERO_MULTIPLIER = 0.55;
export const RAGE_HERO_MULTIPLIER = 0.5;
export const LIGHTNING_STUN = 0.1;
/** Native movement-speed points convert to tiles/second at eight points per tile. */
export const SPELL_SPEED_SCALE = 8;
export const spellProgression = (kind: SpellKind, level: number) => SPELL_LEVELS[kind][level - 1];
