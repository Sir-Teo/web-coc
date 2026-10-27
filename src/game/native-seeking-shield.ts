import { hurtDefender } from './defenders';
import { tickDefenderHitPoison } from './defender-hit-poison';
import type { Battle, Unit } from './model';
import { abilityProjectileTargets, type AbilityProjectileTarget } from './native-ability-targets';
import { nativeRow, num, seconds, text, tiles } from './native-data';
import { preferredDefense } from './native-defense-preference';
import type { HeroAbility } from './native-heroes';
import { unitEffects } from './native-status';
import type { NativeTroopContext } from './native-troops';
import { launchProjectile, type CombatProjectile } from './projectiles';

type TargetRef = { id: number; building: boolean };
export interface SeekingShieldCast {
  id: string;
  sourceId: number;
  sourceLevel: number;
  level: number;
  at: number;
  launchAt: number;
  /** Last observed caster position while winding up; final launch origin once released. */
  x: number;
  y: number;
  projectile: string;
  damage: number;
  bounces: number;
  reach: number;
  copyTarget?: TargetRef;
  released?: true;
  shots: CombatProjectile[];
}
const key = (target: TargetRef) => `${target.building ? 'b' : 'd'}:${target.id}`;
const current = (unit: Unit | undefined): TargetRef | undefined =>
  typeof unit?.defenderTarget === 'number'
    ? { id: unit.defenderTarget, building: false }
    : typeof unit?.target === 'number'
      ? { id: unit.target, building: true }
      : undefined;

function choose(
  battle: Battle,
  from: { x: number; y: number },
  at: number,
  visited: readonly string[],
  reach: number,
  copy?: TargetRef,
) {
  const targets = abilityProjectileTargets(battle, from, at, Infinity).filter(
    (target) => !visited.includes(key(target)) && target.distance <= reach + 1e-9,
  );
  const first = targets[0];
  if (!first || !copy) return first;
  const copied = targets.find(
    (target) => target.id === copy.id && target.building === copy.building,
  );
  const defense = (target: AbilityProjectileTarget) => {
    const building =
      target.building && battle.buildings.find((building) => building.id === target.id);
    return !!building && preferredDefense(battle, building, at);
  };
  return copied && defense(copied) === defense(first) ? copied : first;
}

function origin(cast: SeekingShieldCast, unit: Unit | undefined) {
  if (unit && !unit.native?.recalled && !unit.ejected) {
    cast.x = unit.x;
    cast.y = unit.y;
  }
}

function send(
  ctx: NativeTroopContext,
  cast: SeekingShieldCast,
  shot: Omit<CombatProjectile, 'id' | 'launched' | 'impact'>,
  at: number,
) {
  const packet = launchProjectile(ctx.battle, shot, ctx.effect, at);
  const marker = packet.native!.seekingShield!;
  cast.shots.push({
    ...packet,
    native: { ...packet.native!, seekingShield: { ...marker, visited: [...marker.visited] } },
  });
}

function release(ctx: NativeTroopContext, cast: SeekingShieldCast, unit?: Unit) {
  origin(cast, unit);
  cast.released = true;
  const target = choose(
    ctx.battle,
    cast,
    cast.launchAt,
    [],
    Infinity,
    current(unit) ?? cast.copyTarget,
  );
  send(
    ctx,
    cast,
    {
      weapon: 'native',
      native: {
        name: cast.projectile,
        kind: 'royalchampion',
        level: cast.sourceLevel,
        captureSource: true,
        seekingShield: {
          castId: cast.id,
          index: 0,
          left: target ? cast.bounces : 0,
          reach: cast.reach,
          visited: target ? [key(target)] : [],
          ...(!target ? { wasted: true as const } : {}),
        },
      },
      sourceId: cast.sourceId,
      targetId: target?.id ?? 0,
      targetBuilding: target?.building ?? false,
      ...(target && !target.building ? { targetDefender: true } : {}),
      fromX: cast.x,
      fromY: cast.y,
      x: target?.x ?? 0,
      y: target?.y ?? 0,
      fromAir: false,
      toAir: target?.air ?? false,
      damage: cast.damage,
    },
    cast.launchAt,
  );
}

/** The source fixed wind-up is independent of animation slowdowns; KO-triggered throws bypass it. */
export function launchSeekingShield(
  ctx: NativeTroopContext,
  unit: Unit,
  ability: HeroAbility,
  at: number,
  knockout = false,
) {
  const battle = ctx.battle;
  if (!battle.nativeSeekingShield || ability.name !== 'RoyalChampionShieldBounce') return;
  const projectile = text(ability.row, 'ProjectileOnActivation');
  const copy = current(unit);
  const cast: SeekingShieldCast = {
    id: `seeking-shield:${unit.id}:${at}`,
    sourceId: unit.id,
    sourceLevel: unit.level ?? 1,
    level: ability.level,
    at,
    launchAt: at + (knockout ? 0 : seconds(ability.row, 'PreActivationDelayTime')),
    x: unit.x,
    y: unit.y,
    projectile,
    damage: num(ability.row, 'Damage'),
    bounces: num(ability.row, 'ProjectileBounces'),
    reach: tiles(nativeRow('projectiles', projectile), 'MaxBounceDistance'),
    ...(copy ? { copyTarget: copy } : {}),
    shots: [],
  };
  (battle.nativeSeekingShieldCasts ??= []).push(cast);
  const effects = unitEffects(unit);
  effects.attackDisabledUntil = Math.max(
    effects.attackDisabledUntil ?? 0,
    at + seconds(ability.row, 'DeactivateAfterTime'),
  );
  if (cast.launchAt <= battle.elapsed + 1e-9) release(ctx, cast, unit);
}

/** Runs before physical arrivals so a due short throw can resolve inside this same sample. */
export function stepSeekingShieldLaunches(ctx: NativeTroopContext) {
  const battle = ctx.battle;
  if (!battle.nativeSeekingShield) return;
  for (const cast of battle.nativeSeekingShieldCasts ?? []) {
    if (cast.released) continue;
    const unit = battle.units.find(
      (unit) => unit.id === cast.sourceId && !unit.native?.recalled && !unit.ejected,
    );
    origin(cast, unit);
    if (cast.launchAt <= battle.elapsed + 1e-9) release(ctx, cast, unit);
  }
}

export function resolveSeekingShield(ctx: NativeTroopContext, shot: CombatProjectile) {
  const battle = ctx.battle,
    marker = shot.native?.seekingShield;
  if (!battle.nativeSeekingShield || !marker) return false;
  const cast = battle.nativeSeekingShieldCasts?.find((cast) => cast.id === marker.castId);
  if (!cast || marker.wasted) return true;
  if (shot.targetBuilding) {
    const target = battle.buildings.find((building) => building.id === shot.targetId);
    if (target && target.hp > 0) ctx.damageBuilding(target, shot.damage, shot.impact);
  } else if (shot.targetDefender) {
    const target = battle.defenders?.find((defender) => defender.id === shot.targetId);
    if (target && target.hp > 0 && target.spawnedAt <= shot.impact + 1e-9) {
      if (battle.nativeAttackerHitPoison) tickDefenderHitPoison(target, shot.impact);
      hurtDefender(battle, target, shot.damage, shot.impact);
    }
  }
  const next = marker.left > 0 && choose(battle, shot, shot.impact, marker.visited, marker.reach);
  if (!next) return true;
  marker.continues = true;
  cast.shots[marker.index].native!.seekingShield!.continues = true;
  send(
    ctx,
    cast,
    {
      weapon: 'native',
      native: {
        ...shot.native!,
        bounce: marker.index + 1,
        seekingShield: {
          castId: marker.castId,
          index: marker.index + 1,
          left: marker.left - 1,
          reach: marker.reach,
          visited: [...marker.visited, key(next)],
        },
      },
      sourceId: shot.sourceId,
      targetId: next.id,
      targetBuilding: next.building,
      ...(!next.building ? { targetDefender: true } : {}),
      fromX: shot.x,
      fromY: shot.y,
      x: next.x,
      y: next.y,
      fromAir: !!shot.toAir,
      toAir: next.air,
      damage: shot.damage,
    },
    shot.impact,
  );
  return true;
}
