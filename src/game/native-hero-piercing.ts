import { chainPoint, chainRef } from './chain-targets';
import { applyDefenderFrost } from './defender-frost';
import type { DarkOrbShot } from './native-dark-orb';
import type { GiantArrowShot } from './native-giant-arrow';
import { noteBuildingDamage } from './native-defenses';
import { buildingEffects } from './native-status';
import { stepPiercingShots, type ArcherPiercingShot } from './native-super-archer';
import type { NativeTroopContext } from './native-troops';

/** All enabled hero corridors share the Super Archer arrival order and collision convention. */
export function stepHeroPiercing(ctx: NativeTroopContext) {
  const b = ctx.battle;
  if (!b.nativeGiantArrow && !b.nativeDarkOrb) return;
  const shots: (ArcherPiercingShot | GiantArrowShot | DarkOrbShot)[] = [
    ...(b.nativeArcherShots ?? []),
    ...(b.nativeGiantArrows ?? []),
    ...(b.nativeDarkOrbs ?? []),
  ];
  if (!shots.length) return;
  stepPiercingShots(
    ctx,
    shots,
    (shot, target, at) => {
      if (!('airDefenseMultiplier' in shot) && !('frost' in shot)) return shot.damage;
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
        ('airDefenseMultiplier' in shot &&
        'building' in target &&
        target.building.kind === 'airdefense'
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
      if (b.nativeDarkOrb && damaged && 'frost' in shot) {
        if ('building' in target) {
          if (target.building.hp > 0)
            buildingEffects(b, target.building).frost = {
              until: at + shot.frost.seconds,
              percent: shot.frost.percent,
            };
        } else applyDefenderFrost(target.defender, shot.frost, at);
      }
    },
  );
  const retained = (shot: ArcherPiercingShot) =>
    shot.launched + shot.length / shot.speed + 10 >= b.elapsed - 1e-9;
  if (b.nativeArcherShots) b.nativeArcherShots = b.nativeArcherShots.filter(retained);
  if (b.nativeGiantArrows) b.nativeGiantArrows = b.nativeGiantArrows.filter(retained);
  if (b.nativeDarkOrbs) b.nativeDarkOrbs = b.nativeDarkOrbs.filter(retained);
}
