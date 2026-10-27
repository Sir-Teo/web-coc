import { TROOPS, isTrap } from './data';
import { damageDefenders } from './defenders';
import { abilityProjectileTargets } from './native-ability-targets';
import { distanceTo, type Unit } from './model';
import { num, text, tiles } from './native-data';
import type { HeroAbility } from './native-heroes';
import type { NativeTroopContext } from './native-troops';
import { launchProjectile, type CombatProjectile } from './projectiles';

/** A Fireball selects once at activation; its source projectile does not track the target. */
export function launchWardenFireball(
  ctx: NativeTroopContext,
  unit: Unit,
  ability: HeroAbility,
  at: number,
) {
  const battle = ctx.battle;
  if (!battle.nativeWardenFireball || ability.name !== 'GrandWardenFireball') return;
  const target = abilityProjectileTargets(battle, unit, at)[0];
  const shot = launchProjectile(
    battle,
    {
      weapon: 'native',
      native: {
        name: text(ability.row, 'ProjectileOnActivation'),
        kind: unit.kind,
        level: unit.level ?? 1,
        fireball: { level: ability.level },
      },
      sourceId: unit.id,
      targetId: target?.id ?? 0,
      targetBuilding: target?.building ?? false,
      ...(target && !target.building ? { targetDefender: true } : {}),
      fromX: unit.x,
      fromY: unit.y,
      x: target?.x ?? unit.x,
      y: target?.y ?? unit.y,
      fromAir: !!TROOPS[unit.kind].flying,
      toAir: target?.air ?? false,
      damage: num(ability.row, 'Damage'),
      splash: tiles(ability.row, 'DamageRadius'),
    },
    ctx.effect,
    at,
  );
  // A single-use equipment activation remains inspectable after impact and through cold seeks.
  (battle.nativeFireballs ??= []).push({
    ...shot,
    native: { ...shot.native!, fireball: { level: ability.level } },
  });
}

/** Equipment blast damage is captured independently of the Warden's ordinary attack bonuses. */
export function resolveWardenFireball(ctx: NativeTroopContext, shot: CombatProjectile) {
  if (!ctx.battle.nativeWardenFireball || !shot.native?.fireball) return false;
  for (const building of ctx.battle.buildings)
    if (building.hp > 0 && !isTrap(building.kind) && distanceTo(shot, building) <= shot.splash!)
      ctx.damageBuilding(building, shot.damage, shot.impact);
  damageDefenders(ctx.battle, shot, shot.damage, shot.splash!, 'both', undefined, shot.impact);
  return true;
}
