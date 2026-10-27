import { TROOPS } from './data';
import { hurtDefender } from './defenders';
import { tickDefenderHitPoison } from './defender-hit-poison';
import type { Unit } from './model';
import { abilityProjectileTargets } from './native-ability-targets';
import { num, seconds, text } from './native-data';
import type { HeroAbility } from './native-heroes';
import { buildingEffects, buildingImmune } from './native-status';
import type { NativeTroopContext } from './native-troops';
import { launchProjectile, type CombatProjectile } from './projectiles';

export interface FrostFlakeCast {
  id: string;
  sourceId: number;
  /** Mapped FrostBlast ability level, independently of the 27 equipment levels. */
  level: number;
  at: number;
  x: number;
  y: number;
  /** Captured launches retain their last flight/impact point through cold seeks. */
  shots: CombatProjectile[];
}

export function launchFrostFlake(
  ctx: NativeTroopContext,
  unit: Unit,
  ability: HeroAbility,
  at: number,
) {
  const battle = ctx.battle;
  if (!battle.nativeFrostFlake || ability.name !== 'FrostBlast') return;
  const cast: FrostFlakeCast = {
    id: `frost-flake:${unit.id}:${at}`,
    sourceId: unit.id,
    level: ability.level,
    at,
    x: unit.x,
    y: unit.y,
    shots: [],
  };
  (battle.nativeFrostFlakeCasts ??= []).push(cast);
  const targets = abilityProjectileTargets(
    battle,
    unit,
    at,
    num(ability.row, 'ProjectileOnActivationCount'),
  );
  for (const [index, target] of targets.entries()) {
    const shot = launchProjectile(
      battle,
      {
        weapon: 'native',
        native: {
          name: text(ability.row, 'ProjectileOnActivation'),
          kind: unit.kind,
          level: unit.level ?? 1,
          frostFlake: { castId: cast.id, index, seconds: seconds(ability.row, 'FrostOnHitTime') },
        },
        sourceId: unit.id,
        targetId: target.id,
        targetBuilding: target.building,
        ...(!target.building ? { targetDefender: true } : {}),
        fromX: unit.x,
        fromY: unit.y,
        x: target.x,
        y: target.y,
        fromAir: !!TROOPS[unit.kind].flying,
        toAir: target.air,
        damage: num(ability.row, 'Damage'),
      },
      ctx.effect,
      at,
    );
    cast.shots.push({
      ...shot,
      native: { ...shot.native!, frostFlake: { ...shot.native!.frostFlake! } },
    });
  }
}

/** FrostBlast declares 100% freeze; partial frost's minimum action rate must not apply. */
export function resolveFrostFlake(ctx: NativeTroopContext, shot: CombatProjectile) {
  const battle = ctx.battle,
    source = shot.native?.frostFlake;
  if (!battle.nativeFrostFlake || !source) return false;
  const until = shot.impact + source.seconds;
  if (shot.targetBuilding) {
    const target = battle.buildings.find((b) => b.id === shot.targetId);
    if (!target || target.hp <= 0 || buildingImmune(battle, target, shot.impact)) return true;
    ctx.damageBuilding(target, shot.damage, shot.impact);
    if (target.hp > 0) {
      const effects = buildingEffects(battle, target);
      effects.frozenUntil = Math.max(effects.frozenUntil ?? 0, until);
      battle.defenseStuns[target.id] = Math.max(
        battle.defenseStuns[target.id] ?? 0,
        effects.frozenUntil,
      );
      delete battle.defenseTargets[target.id];
    }
  } else if (shot.targetDefender) {
    const target = battle.defenders?.find((d) => d.id === shot.targetId);
    if (!target || target.hp <= 0 || target.spawnedAt > shot.impact + 1e-9) return true;
    if (battle.nativeAttackerHitPoison) tickDefenderHitPoison(target, shot.impact);
    hurtDefender(battle, target, shot.damage, shot.impact);
    if (target.hp > 0) {
      target.stunnedUntil = Math.max(target.stunnedUntil ?? 0, until);
      target.frozenUntil = Math.max(target.frozenUntil ?? 0, until);
    }
  }
  return true;
}
