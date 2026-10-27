import { BUILDINGS } from './data';
import { distance2D } from './distance';
import { MAP_SIZE } from './grid';
import type { Unit } from './model';
import { abilityProjectileTargets } from './native-ability-targets';
import { nativeRow, num, seconds, text, tiles } from './native-data';
import type { HeroAbility } from './native-heroes';
import type { NativeTroopContext } from './native-troops';
import type { ArcherPiercingShot } from './native-super-archer';

export interface DarkOrbShot extends ArcherPiercingShot {
  fromAir: true;
  frost: { seconds: number; percent: number };
}

/** Copy the Prince's current heading; the source maximum lifetime bounds its extra range. */
export function launchDarkOrb(
  ctx: NativeTroopContext,
  unit: Unit,
  ability: HeroAbility,
  at: number,
) {
  const battle = ctx.battle;
  if (!battle.nativeDarkOrb || ability.name !== 'MinionAttackAbility') return;
  const center = (id: number | undefined) => {
    const building = typeof id === 'number' ? ctx.buildingsById.get(id) : undefined;
    return (
      building && {
        x: building.x + BUILDINGS[building.kind].size / 2,
        y: building.y + BUILDINGS[building.kind].size / 2,
      }
    );
  };
  const target =
    center(unit.native?.wallTarget) ??
    battle.defenders?.find((d) => d.id === unit.defenderTarget) ??
    center(unit.target ?? undefined) ??
    abilityProjectileTargets(battle, unit, at)[0];
  const dx = target ? target.x - unit.x : 1,
    dy = target ? target.y - unit.y : 1;
  const distance = distance2D(dx, dy);
  const dirX = distance > 1e-9 ? dx / distance : Math.SQRT1_2;
  const dirY = distance > 1e-9 ? dy / distance : Math.SQRT1_2;
  const projectile = text(ability.row, 'ProjectileOnActivation');
  const row = nativeRow('projectiles', projectile),
    speed = num(row, 'Speed') / 100;
  const edge = (origin: number, direction: number) =>
    direction > 0
      ? (MAP_SIZE - origin) / direction
      : direction < 0
        ? -origin / direction
        : Infinity;
  const maxTime = seconds(row, 'MaxTravelTime');
  const length = Math.max(
    0,
    Math.min(
      distance + tiles(ability.row, 'PenetratingExtraRange'),
      maxTime > 0 ? speed * maxTime : Infinity,
      edge(unit.x, dirX),
      edge(unit.y, dirY),
    ),
  );
  (battle.nativeDarkOrbs ??= []).push({
    id: `dark-orb:${unit.id}:${at}`,
    sourceId: unit.id,
    level: ability.level,
    projectile,
    fromX: unit.x,
    fromY: unit.y,
    dirX,
    dirY,
    length,
    speed,
    radius: tiles(ability.row, 'PenetratingRadius'),
    launched: at,
    travelled: 0,
    damage: num(ability.row, 'Damage'),
    fromAir: true,
    frost: {
      seconds: seconds(ability.row, 'FrostOnHitTime'),
      percent: num(ability.row, 'FrostOnHitPercent') / 100,
    },
    hit: [],
  });
}
