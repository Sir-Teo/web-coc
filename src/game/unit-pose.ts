import { BUILDINGS, TROOPS } from './data';
import type { Building, Unit } from './model';

/** Sprite mirroring follows navigation while walking and the target when striking. */
export function unitPose(u: Unit, target: Building | undefined, previousFacing = -1) {
  const center =
    target && target.hp > 0
      ? {
          x: target.x + BUILDINGS[target.kind].size / 2,
          y: target.y + BUILDINGS[target.kind].size / 2,
        }
      : undefined;
  const waypoint = u.path.find((p) => Math.hypot(p.x - u.x, p.y - u.y) > 0.03);
  const heading = u.attacking || TROOPS[u.kind].flying ? center : (waypoint ?? center);
  const screenDx = heading ? heading.x - u.x - (heading.y - u.y) : 0;
  // Looking straight up/down should preserve the last side rather than flicker.
  const facing = Math.abs(screenDx) > 0.03 ? Math.sign(screenDx) : previousFacing;
  const moving = !u.attacking && !!(TROOPS[u.kind].flying ? center : waypoint);
  return { facing, moving, flipX: u.hero || TROOPS[u.kind].staticSprite ? facing < 0 : facing > 0 };
}
