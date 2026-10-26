import { BUILDINGS } from './data';
import { chainPoint, chainRef } from './chain-targets';
import { distance2D } from './distance';
import { MAP_SIZE } from './grid';
import { targetableBuilding } from './hidden-tesla';
import { distanceTo, type Unit } from './model';
import { nativeRow, num, text, tiles } from './native-data';
import { noteBuildingDamage } from './native-defenses';
import type { HeroAbility } from './native-heroes';
import type { NativeTroopContext } from './native-troops';
import { stepPiercingShots, type ArcherPiercingShot } from './native-super-archer';

export interface GiantArrowShot extends ArcherPiercingShot {
  /** Captured equipment modifier; ordinary attack boosts never alter this projectile. */
  airDefenseMultiplier: number;
}

/** Copy the Queen's actual wall, defender or building heading, as the native actor renderer does. */
export function launchGiantArrow(
  ctx: NativeTroopContext,
  unit: Unit,
  ability: HeroAbility,
  at: number,
) {
  const battle = ctx.battle;
  if (!battle.nativeGiantArrow || ability.name !== 'ArcherQueenPierceProjectile') return;
  const center = (id: number | undefined) => {
    const building = typeof id === 'number' ? ctx.buildingsById.get(id) : undefined;
    return (
      building && {
        x: building.x + BUILDINGS[building.kind].size / 2,
        y: building.y + BUILDINGS[building.kind].size / 2,
      }
    );
  };
  let target =
    center(unit.native?.wallTarget) ??
    battle.defenders?.find((d) => d.id === unit.defenderTarget) ??
    center(unit.target ?? undefined);
  if (!target) {
    // An activation on the deployment frame can precede the first ordinary AI target assignment.
    const nearest = battle.buildings
      .filter((b) => b.kind !== 'wall' && targetableBuilding(battle, b))
      .sort((a, b) => distanceTo(unit, a) - distanceTo(unit, b) || a.id - b.id)[0];
    target = nearest && center(nearest.id);
  }
  const dx = target ? target.x - unit.x : 1,
    dy = target ? target.y - unit.y : 1,
    distance = distance2D(dx, dy),
    dirX = distance > 1e-9 ? dx / distance : Math.SQRT1_2,
    dirY = distance > 1e-9 ? dy / distance : Math.SQRT1_2,
    projectile = text(ability.row, 'ProjectileOnActivation'),
    row = nativeRow('projectiles', projectile),
    fromX = unit.x,
    fromY = unit.y;
  const edge = (origin: number, direction: number) =>
    direction > 0
      ? (MAP_SIZE - origin) / direction
      : direction < 0
        ? -origin / direction
        : Infinity;
  const length = Math.max(
    0,
    Math.min(
      distance + tiles(ability.row, 'PenetratingExtraRange'),
      edge(fromX, dirX),
      edge(fromY, dirY),
    ),
  );
  (battle.nativeGiantArrows ??= []).push({
    id: `giant-arrow:${unit.id}:${at}`,
    sourceId: unit.id,
    level: ability.level,
    projectile,
    fromX,
    fromY,
    dirX,
    dirY,
    length,
    speed: num(row, 'Speed') / 100,
    radius: tiles(ability.row, 'PenetratingRadius'),
    launched: at,
    travelled: 0,
    damage: num(ability.row, 'Damage'),
    airDefenseMultiplier: 1 + num(ability.row, 'ExtraDamagePercentageAgainstTarget') / 100,
    hit: [],
  });
}

/** New recordings resolve all piercing arrivals together, including simultaneous Super Archers. */
export function stepGiantArrows(ctx: NativeTroopContext) {
  const b = ctx.battle;
  if (!b.nativeGiantArrow) return;
  const shots: (ArcherPiercingShot | GiantArrowShot)[] = [
    ...(b.nativeArcherShots ?? []),
    ...(b.nativeGiantArrows ?? []),
  ];
  if (!shots.length) return;
  stepPiercingShots(
    ctx,
    shots,
    (shot, target, at) => {
      if (!('airDefenseMultiplier' in shot)) return shot.damage;
      const point = chainPoint(target),
        ref = chainRef(target);
      ctx.effect({
        type: 'impact',
        weapon: 'native',
        projectileId: shot.id,
        sourceId: shot.sourceId,
        targetId: ref.id,
        targetBuilding: ref.building,
        ...(!ref.building ? { targetDefender: true } : {}),
        x: shot.fromX,
        y: shot.fromY,
        toX: point.x,
        toY: point.y,
        at,
      });
      return (
        shot.damage *
        ('building' in target && target.building.kind === 'airdefense'
          ? shot.airDefenseMultiplier
          : 1)
      );
    },
    (shot, target, at, damaged) => {
      if (
        b.nativeGiantArrowConstructs &&
        damaged &&
        'airDefenseMultiplier' in shot &&
        'building' in target
      )
        noteBuildingDamage(b, target.building, at, false, {
          key: shot.id,
          until: shot.launched + shot.length / shot.speed,
        });
    },
  );
  const retained = (shot: ArcherPiercingShot) =>
    shot.launched + shot.length / shot.speed + 10 >= b.elapsed - 1e-9;
  if (b.nativeArcherShots) b.nativeArcherShots = b.nativeArcherShots.filter(retained);
  if (b.nativeGiantArrows) b.nativeGiantArrows = b.nativeGiantArrows.filter(retained);
}
