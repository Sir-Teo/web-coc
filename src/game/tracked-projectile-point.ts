import type { CombatProjectile } from './projectiles';
type Point = { x: number; y: number };
/** Use simulation-owned ground position with the existing local muzzle/target height projection. */
export function trackedProjectilePoint(
  projectile: CombatProjectile,
  from: Point,
  to: Point,
  iso: (x: number, y: number) => Point,
): Point {
  if (!projectile.flight) throw new Error('Tracking projectile has no physical position');
  const p = projectile.flight;
  const travelled = Math.hypot(p.x - projectile.fromX, p.y - projectile.fromY);
  const remaining = Math.hypot(projectile.x - p.x, projectile.y - p.y);
  const progress = travelled + remaining ? travelled / (travelled + remaining) : 1;
  const ground = iso(p.x, p.y);
  const origin = iso(projectile.fromX, projectile.fromY);
  const target = iso(projectile.x, projectile.y);
  return {
    x: ground.x,
    y: ground.y + (from.y - origin.y) * (1 - progress) + (to.y - target.y) * progress,
  };
}
