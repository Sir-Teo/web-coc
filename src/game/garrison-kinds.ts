import {
  defendingCharacterLevel,
  projectileRow,
  sourceFlag,
  sourceNumber,
  specialAbility,
  spellLevel,
  type SourceRow,
} from './character-catalog';

/**
 * Campaign garrison families. Each kind names its roster character; combat values come from
 * the pinned client row at the roster's VisualLevel (after any DefensiveTroop substitution).
 * A kind is playable only at levels listed here, because each level needs its captured
 * animation graph and its source behavior fields to be implemented and verified.
 */
export const GARRISON_KINDS = {
  dragon: { character: 'Dragon', levels: { 5: 44, 7: 38 } },
  balloon: { character: 'Balloon', levels: { 8: 38 } },
  goblin: { character: 'Goblin', levels: { 7: 44 } },
  archer: { character: 'Archer', levels: { 9: 44 } },
  pekka: { character: 'PEKKA', levels: { 8: 44 } },
  valkyrie: { character: 'Valkyrie', levels: { 7: 44 } },
  headhunter: { character: 'Headhunter', levels: { 3: 44 } },
  superminion: { character: 'Super Minion', levels: { 9: 44 } },
  babydragon: { character: 'Baby Dragon', levels: { 6: 44 } },
} as const satisfies Record<string, { character: string; levels: Record<number, number> }>;
export type GarrisonKind = keyof typeof GARRISON_KINDS;
export const isGarrisonKind = (value: unknown): value is GarrisonKind =>
  typeof value === 'string' && Object.hasOwn(GARRISON_KINDS, value);
/**
 * Roster families that still need behavior (chain lightning, secondary/summoned troops,
 * bouncing boulders, auras, boss units). They keep their villages gated in their entirety.
 */
export const PENDING_GARRISON_CHARACTERS = [
  'Electro Dragon',
  'Golem',
  'Witch',
  'Bowler',
  'Lava Hound',
  'Electro Titan',
  'Golden Dragon',
  'MOMMA',
] as const;
export function garrisonKindForCharacter(character: string): GarrisonKind | undefined {
  return (Object.keys(GARRISON_KINDS) as GarrisonKind[]).find(
    (kind) => GARRISON_KINDS[kind].character === character,
  );
}
/** First replay version that may contain this troop level, or undefined when unsupported. */
export function garrisonTroopVersion(kind: unknown, level: unknown): number | undefined {
  if (!isGarrisonKind(kind) || typeof level !== 'number') return undefined;
  return (GARRISON_KINDS[kind].levels as Record<number, number>)[level];
}

function specialAbilityFor(row: SourceRow) {
  const name = typeof row.SpecialAbilities === 'string' ? row.SpecialAbilities : '';
  if (!name) return undefined;
  return { name, level: sourceNumber(row, 'SpecialAbilitiesLevel') || 1 };
}

const statsCache = new Map<string, ReturnType<typeof resolveStats>>();
function resolveStats(kind: GarrisonKind, level: number) {
  const resolved = defendingCharacterLevel(GARRISON_KINDS[kind].character, level);
  if (!resolved) throw new Error(`Unsupported garrison troop: ${kind} ${level}`);
  const { character, row } = resolved;
  const interval = sourceNumber(row, 'AttackSpeed');
  const newTarget = sourceNumber(row, 'NewTargetAttackDelay');
  const ability = specialAbilityFor(row);
  const projectile = typeof row.Projectile === 'string' && row.Projectile ? row.Projectile : undefined;
  const heroMultiplier = sourceNumber(row, 'HeroDamageMultiplier');
  return {
    character,
    row: sourceNumber(row, 'row'),
    visualLevel: sourceNumber(row, 'VisualLevel'),
    animation: String(row.Animation),
    hp: sourceNumber(row, 'Hitpoints'),
    housing: sourceNumber(row, 'HousingSpace'),
    dps: sourceNumber(row, 'DPS'),
    damage: (sourceNumber(row, 'DPS') * interval) / 1000,
    rate: interval / 1000,
    speed: sourceNumber(row, 'Speed') / 100,
    range: sourceNumber(row, 'AttackRange') / 100,
    splash: sourceNumber(row, 'DamageRadius') / 100,
    selfAsAoeCenter: sourceFlag(row, 'SelfAsAoeCenter'),
    groundTargets: sourceFlag(row, 'GroundTargets'),
    airTargets: sourceFlag(row, 'AirTargets'),
    flying: sourceFlag(row, 'IsFlying'),
    newTargetDelay: newTarget / 1000,
    /** Initial timer charge in the older engine; wait is interval minus that charge. */
    firstAttackDelay: Math.max(0, (interval - newTarget) / 1000),
    deathDamage: sourceNumber(row, 'DieDamage'),
    deathRadius: sourceNumber(row, 'DieDamageRadius') / 100,
    deathDelay: sourceNumber(row, 'DieDamageDelay') / 1000,
    /** Source projectile row; troops without one resolve damage at the attack event. */
    projectile,
    projectileSpeed: projectile ? sourceNumber(projectileRow(projectile), 'Speed') / 100 : 0,
    preferHeroes: sourceFlag(row, 'PreferHeroes'),
    /** HeroDamageMultiplier is a percentage of the attack's damage; absent means 100%. */
    heroDamageScale: heroMultiplier ? heroMultiplier / 100 : 1,
    ability,
  };
}
/** Only resolved, supported source levels. Never apply home troop caps or clamp a level. */
export function garrisonStats(kind: GarrisonKind, level: number) {
  if (garrisonTroopVersion(kind, level) === undefined)
    throw new Error(`Unsupported garrison troop: ${kind} ${level}`);
  const key = `${kind}:${level}`;
  let stats = statsCache.get(key);
  if (!stats) statsCache.set(key, (stats = resolveStats(kind, level)));
  return stats;
}
export type GarrisonStats = ReturnType<typeof garrisonStats>;

/** Poison applied by each hit (Headhunter). Spell rows are percentages and per-second values. */
export function garrisonPoisonOnHit(stats: GarrisonStats) {
  if (!stats.ability) return undefined;
  const ability = specialAbility(stats.ability.name, stats.ability.level);
  if (!ability.PoisonOnHitSpell) return undefined;
  const spell = spellLevel(ability.PoisonOnHitSpell, sourceNumber(ability, 'PoisonOnHitSpellLevel'));
  const heroMultiplier = sourceNumber(spell, 'HeroDamageMultiplier');
  return {
    spell: ability.PoisonOnHitSpell,
    spellLevel: sourceNumber(ability, 'PoisonOnHitSpellLevel'),
    duration: sourceNumber(ability, 'PoisonOnHitDuration') / 1000,
    dps: sourceNumber(spell, 'PoisonDPS'),
    heroDamageScale: heroMultiplier ? heroMultiplier / 100 : 1,
    /** Negative SpeedBoost is a percentage slow in the pinned older movement system. */
    moveScale: (100 + Math.min(0, sourceNumber(spell, 'SpeedBoost'))) / 100,
    attackScale: (100 + sourceNumber(spell, 'AttackSpeedBoost')) / 100,
    affectsAir: sourceFlag(spell, 'PoisonAffectAir'),
  };
}
/** Baby Dragon Tantrum: boosted while no other friendly flying unit is within the radius. */
export function garrisonTantrum(stats: GarrisonStats) {
  if (!stats.ability) return undefined;
  const ability = specialAbility(stats.ability.name, stats.ability.level);
  if (!ability.ActiveWhileAloneRadius) return undefined;
  return {
    radius: sourceNumber(ability, 'ActiveWhileAloneRadius') / 100,
    deactivateRadius: sourceNumber(ability, 'DeactivateWhileNotAloneRadius') / 100,
    damageScale: (100 + sourceNumber(ability, 'BoostDamagePercentage')) / 100,
    attackScale: (100 + sourceNumber(ability, 'BoostAttackSpeedPercentage')) / 100,
  };
}
/** Super Minion long shots: initial attacks use the ability range and projectile. */
export function garrisonLongShots(stats: GarrisonStats) {
  if (!stats.ability) return undefined;
  const ability = specialAbility(stats.ability.name, stats.ability.level);
  if (!ability.DeactivateAfterNumberOfHits || !ability.AttackRange) return undefined;
  const projectile = ability.Projectile || stats.projectile!;
  return {
    count: sourceNumber(ability, 'DeactivateAfterNumberOfHits'),
    range: sourceNumber(ability, 'AttackRange') / 100,
    projectile,
    projectileSpeed: sourceNumber(projectileRow(projectile), 'Speed') / 100,
  };
}
