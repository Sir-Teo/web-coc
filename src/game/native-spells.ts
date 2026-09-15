import { distance2D } from './distance';
import { BUILDINGS, TROOPS, isTrap, type BuildingKind } from './data';
import { damageDefenders, hurtDefender } from './defenders';
import { flag, nativeRow, num, seconds, text, tiles, type NativeRow } from './native-data';
import { buildingEffects, healUnit, hurtUnit, unitEffects } from './native-status';
import { concealedTesla } from './hidden-tesla';
import type { Battle, Building, FX, Unit } from './model';

/** Buildings immune to storage/Town Hall flags, following the client's building classes. */
const TOWN_HALL_OR_CASTLE = new Set<BuildingKind>(['townhall', 'clancastle']);
const STORAGES = new Set<BuildingKind>(['goldstorage', 'elixirstorage', 'darkstorage']);

export type SpellSide = 'attack' | 'defense';
export interface NativeSpellCast {
  id: number;
  name: string;
  level: number;
  side: SpellSide;
  x: number;
  y: number;
  /** Aura center follows this living attacker. */
  follow?: number;
  /** Unit or building excluded by DoesNotAffectOwner. */
  owner?: number;
  castAt: number;
  firstHit: number;
  hits: number;
  total: number;
  interval: number;
  /** Deterministic sequence for random strike positions. */
  seed: number;
  ended?: boolean;
}
export interface NativeSpellContext {
  battle: Battle;
  damageBuilding(target: Building, amount: number, at: number): void;
  effect(fx: FX): void;
}

export const spellRow = (name: string, level: number): NativeRow =>
  nativeRow('spells', name, level);

/** Client timeline: deploy, charge and hit delays precede the first pulse. */
export function castNativeSpell(
  battle: Battle,
  name: string,
  level: number,
  side: SpellSide,
  x: number,
  y: number,
  options: { at?: number; follow?: number; owner?: number; immediate?: boolean } = {},
) {
  const row = spellRow(name, level);
  const at = options.at ?? battle.elapsed;
  const delay = options.immediate
    ? seconds(row, 'HitTimeMS')
    : seconds(row, 'DeployTimeMS') + seconds(row, 'ChargingTimeMS') + seconds(row, 'HitTimeMS');
  const cast: NativeSpellCast = {
    id: (battle.nativeSpellSequence = (battle.nativeSpellSequence ?? 0) + 1),
    name,
    level,
    side,
    x,
    y,
    ...(options.follow !== undefined ? { follow: options.follow } : {}),
    ...(options.owner !== undefined ? { owner: options.owner } : {}),
    castAt: at,
    firstHit: at + delay,
    hits: 0,
    total: Math.max(1, num(row, 'NumberOfHits', 1)),
    interval: seconds(row, 'TimeBetweenHitsMS'),
    seed: (battle.seed * 7919 + battle.nativeSpellSequence! * 104729) >>> 0,
  };
  (battle.nativeSpells ??= []).push(cast);
  return cast;
}

/** Stateless integer hash; the same cast resolves the same strike offsets during every replay. */
function random(seed: number, index: number) {
  let v = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  v = Math.imul(v ^ (v >>> 16), 0x85ebca6b) >>> 0;
  v = Math.imul(v ^ (v >>> 13), 0xc2b2ae35) >>> 0;
  return ((v ^ (v >>> 16)) >>> 0) / 0x100000000;
}

const buildingImmune = (row: NativeRow, b: Building) =>
  isTrap(b.kind) ||
  (b.kind === 'wall' && flag(row, 'ImmunityWalls')) ||
  (TOWN_HALL_OR_CASTLE.has(b.kind) && flag(row, 'ImmunityTH_CC')) ||
  (STORAGES.has(b.kind) && flag(row, 'ImmunityStorages')) ||
  (b.kind !== 'wall' &&
    !TOWN_HALL_OR_CASTLE.has(b.kind) &&
    !STORAGES.has(b.kind) &&
    flag(row, 'ImmunityOtherBuildings'));

const footprintDistance = (x: number, y: number, b: Building) => {
  const size = BUILDINGS[b.kind].size;
  return distance2D(Math.max(b.x - x, 0, x - b.x - size), Math.max(b.y - y, 0, y - b.y - size));
};

/** Resolve every pulse whose scheduled time has been reached, in cast order. */
export function stepNativeSpells(ctx: NativeSpellContext) {
  const battle = ctx.battle;
  for (const cast of battle.nativeSpells ?? []) {
    if (cast.ended) continue;
    while (cast.hits < cast.total) {
      const at = cast.firstHit + cast.hits * cast.interval;
      if (at > battle.elapsed + 1e-9) break;
      if (cast.follow !== undefined) {
        const owner = battle.units.find((u) => u.id === cast.follow);
        if (!owner || owner.hp <= 0) {
          cast.ended = true;
          break;
        }
        cast.x = owner.x;
        cast.y = owner.y;
      }
      resolvePulse(ctx, cast, at);
      cast.hits++;
    }
    if (cast.hits >= cast.total) cast.ended = true;
  }
  if (battle.nativeSpells?.some((cast) => cast.ended))
    battle.nativeSpells = battle.nativeSpells.filter((cast) => !cast.ended);
}

function resolvePulse(ctx: NativeSpellContext, cast: NativeSpellCast, at: number) {
  const battle = ctx.battle;
  const row = spellRow(cast.name, cast.level);
  const randomRadius = flag(row, 'RandomRadiusAffectsOnlyGfx') ? 0 : tiles(row, 'RandomRadius');
  let x = cast.x,
    y = cast.y;
  if (randomRadius > 0) {
    const angle = random(cast.seed, cast.hits * 2) * Math.PI * 2;
    const distance = Math.sqrt(random(cast.seed, cast.hits * 2 + 1)) * randomRadius;
    x += Math.cos(angle) * distance;
    y += Math.sin(angle) * distance;
  }
  const radius = tiles(row, 'Radius');
  const damage = num(row, 'Damage');
  const heroScale = num(row, 'HeroDamageMultiplier', 100) / 100;
  const freeze = seconds(row, 'FreezeTimeMS');
  const outerFreeze = seconds(row, 'FreezeOuterTimeMS') || freeze;
  const freezePercent = num(row, 'FreezePercent') / 100;
  const stun = seconds(row, 'StunTimeMS');
  const boostTime = seconds(row, 'BoostTimeMS');
  const poisonDps = num(row, 'PoisonDPS');
  const extraPermil = num(row, 'ExtraHealthPermil');
  const shieldTime = seconds(row, 'ShieldTime');
  const inRange = (distance: number) => distance <= radius + 1e-9;
  const inner = (distance: number) => distance <= radius / 2 + 1e-9;
  const enemyOfAttack = cast.side === 'attack';

  // Harmful effects on the defending village.
  if (enemyOfAttack) {
    if (damage > 0 || freeze > 0 || stun > 0) {
      for (const b of battle.buildings) {
        if (b.hp <= 0 || buildingImmune(row, b) || concealedTesla(battle, b)) continue;
        const distance = footprintDistance(x, y, b);
        if (!inRange(distance)) continue;
        if (damage > 0) ctx.damageBuilding(b, damage, at);
        if (freeze > 0 && freezePercent <= 0) {
          const e = buildingEffects(battle, b);
          e.frozenUntil = Math.max(
            e.frozenUntil ?? 0,
            at + (inner(distance) ? freeze : outerFreeze),
          );
          battle.defenseStuns[b.id] = Math.max(battle.defenseStuns[b.id] ?? 0, e.frozenUntil);
        } else if (freeze > 0) {
          const e = buildingEffects(battle, b);
          e.chill = { until: Math.max(e.chill?.until ?? 0, at + freeze), percent: freezePercent };
        }
        if (stun > 0) {
          const e = buildingEffects(battle, b);
          e.stunUntil = Math.max(e.stunUntil ?? 0, at + stun);
          battle.defenseStuns[b.id] = Math.max(battle.defenseStuns[b.id] ?? 0, e.stunUntil);
        }
      }
      if (damage > 0) damageDefenders(battle, { x, y }, damage, radius, 'both');
      if (freeze > 0 || stun > 0)
        for (const d of battle.defenders ?? [])
          if (d.hp > 0 && inRange(distance2D(d.x - x, d.y - y)))
            d.stunnedUntil = Math.max(d.stunnedUntil ?? 0, at + Math.max(freeze, stun));
    }
    if (poisonDps > 0)
      for (const d of battle.defenders ?? [])
        if (d.hp > 0 && inRange(distance2D(d.x - x, d.y - y)))
          hurtDefender(battle, d, poisonDps * cast.interval || poisonDps);
  } else {
    // Defensive casts harm attacking units.
    for (const u of battle.units) {
      if (u.hp <= 0 || (u.spawnedAt ?? 0) > at + 1e-9 || u.ejected) continue;
      if (TROOPS[u.kind].flying && !flag(row, 'PoisonAffectAir') && poisonDps > 0) continue;
      if (!inRange(distance2D(u.x - x, u.y - y))) continue;
      const scale = u.hero ? heroScale : 1;
      if (damage > 0) hurtUnit(battle, u, damage * scale, at);
      if (poisonDps > 0) {
        const e = unitEffects(u);
        const since = e.poison && e.poison.until >= at ? e.poison.since : at;
        e.poison = {
          until: at + (boostTime || cast.interval),
          speed: num(row, 'SpeedBoost') / 100,
          attackSpeed: num(row, 'AttackSpeedBoost') / 100,
          dps: poisonDps,
          since,
        };
        hurtUnit(battle, u, poisonDps * (cast.interval || 1) * scale, at);
      }
      if (freeze > 0) {
        const e = unitEffects(u);
        if (freezePercent > 0)
          e.chill = { until: Math.max(e.chill?.until ?? 0, at + freeze), percent: freezePercent };
        else e.frozenUntil = Math.max(e.frozenUntil ?? 0, at + freeze);
      }
    }
  }

  // Friendly support effects.
  if (enemyOfAttack) {
    for (const u of battle.units) {
      if (u.hp <= 0 || u.ejected || (u.spawnedAt ?? 0) > at + 1e-9) continue;
      if (flag(row, 'DoesNotAffectOwner') && u.id === cast.owner) continue;
      if (!inRange(distance2D(u.x - x, u.y - y))) continue;
      const e = () => unitEffects(u);
      if (
        damage < 0 &&
        !(TROOPS[u.kind].flying && text(row, 'TargetInfoString').includes('GROUND'))
      )
        healUnit(battle, u, -damage * (u.hero ? heroScale : 1));
      if (boostTime > 0 && num(row, 'PoisonDPS') <= 0) {
        const speed = num(row, 'SpeedBoost') / 100,
          boostDamage = num(row, 'DamageBoostPercent') / 100,
          attackSpeed = num(row, 'AttackSpeedBoost') / 100;
        const old = e().boost;
        const until = at + boostTime;
        if (!old || old.until <= at + 1e-9 || boostDamage + speed >= old.damage + old.speed)
          e().boost = { until, speed, damage: boostDamage, attackSpeed };
        else old.until = Math.max(old.until, until);
      }
      if (seconds(row, 'JumpBoostMS') > 0)
        e().jumpUntil = Math.max(e().jumpUntil ?? 0, at + seconds(row, 'JumpBoostMS'));
      if (seconds(row, 'InvisibilityTime') > 0 && !flag(row, 'Overgrowth'))
        e().invisibleUntil = Math.max(
          e().invisibleUntil ?? 0,
          at + seconds(row, 'InvisibilityTime'),
        );
      if (shieldTime > 0 && !flag(row, 'Overgrowth'))
        e().shield = {
          until: Math.max(e().shield?.until ?? 0, at + shieldTime),
          percent: num(row, 'ShieldProtectionPercent') / 100,
        };
      if (extraPermil > 0) {
        const cap = num(row, 'ExtraHealthMax');
        const amount = Math.min(cap > 0 ? cap : Infinity, (u.maxHp * extraPermil) / 1000);
        const old = e().extraHp;
        e().extraHp = {
          until: at + (cast.interval || 0.3) + 1e-6,
          amount: old && old.until >= at ? Math.min(old.amount, amount) : amount,
        };
      }
      if (seconds(row, 'ImmortalTime') > 0)
        e().immortalUntil = Math.max(e().immortalUntil ?? 0, at + seconds(row, 'ImmortalTime'));
    }
  }
  if (cast.hits === 0 || randomRadius > 0)
    ctx.effect({ type: 'spell-native', x, y, radius, text: cast.name, sourceId: cast.id });
}

export const spellEndTime = (cast: NativeSpellCast) =>
  cast.firstHit + Math.max(0, cast.total - 1) * cast.interval;
export const unitEligible = (u: Unit, at: number) =>
  u.hp > 0 && !u.ejected && (u.spawnedAt ?? 0) <= at + 1e-9;
