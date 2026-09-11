import { BUILDINGS, TROOPS, isTrap } from './data';
import type { Battle, Building, FX } from './model';

export type Weapon = 'arrow' | 'cannonball' | 'rocket' | 'fireball' | 'bomb' | 'arcane';
export interface CombatProjectile {
  id: string;
  weapon: Weapon;
  sourceId: number;
  targetId: number;
  targetBuilding: boolean;
  fromX: number;
  fromY: number;
  x: number;
  y: number;
  fromAir?: boolean;
  toAir?: boolean;
  launched: number;
  impact: number;
  damage: number;
  splash?: number;
  splashScale?: number;
}

// Local tuning in tiles/second. Flight is driven by battle time, including replay speed.
const SPEED: Record<Weapon, number> = {
  arrow: 18,
  cannonball: 16,
  rocket: 22,
  fireball: 14,
  bomb: 10,
  arcane: 16,
};
export function launchProjectile(
  battle: Battle,
  shot: Omit<CombatProjectile, 'id' | 'launched' | 'impact'>,
  emit: (fx: FX) => void,
) {
  const duration =
    shot.weapon === 'bomb'
      ? 0.33
      : Math.max(0.12, Math.hypot(shot.x - shot.fromX, shot.y - shot.fromY) / SPEED[shot.weapon]);
  const projectile: CombatProjectile = {
    ...shot,
    id: `${shot.sourceId}:${battle.elapsed}`,
    launched: battle.elapsed,
    impact: battle.elapsed + duration,
  };
  (battle.projectiles ??= []).push(projectile);
  emit(projectileEffect(projectile, 'projectile'));
  return projectile;
}

export function projectileEffect(p: CombatProjectile, type: 'projectile' | 'impact'): FX {
  return {
    type,
    projectileId: p.id,
    weapon: p.weapon,
    x: p.fromX,
    y: p.fromY,
    toX: p.x,
    toY: p.y,
    sourceId: p.sourceId,
    targetId: p.targetId,
    targetBuilding: p.targetBuilding,
    fromAir: p.fromAir,
    toAir: p.toAir,
  };
}

/** Resolve once even if the shooter died. Direct shots never switch targets. */
export function stepProjectiles(
  battle: Battle,
  damage: (target: Building, power: number) => void,
  emit: (fx: FX) => void,
) {
  const pending: CombatProjectile[] = [];
  for (const p of [...(battle.projectiles ?? [])].sort((a, b) => a.impact - b.impact)) {
    const target = p.targetBuilding
      ? battle.buildings.find((b) => b.id === p.targetId)
      : battle.units.find((u) => u.id === p.targetId);
    if (target && target.hp > 0) {
      const size = p.targetBuilding ? BUILDINGS[(target as Building).kind].size : 0;
      p.x = target.x + size / 2;
      p.y = target.y + size / 2;
    }
    if (p.impact > battle.elapsed + 1e-9) {
      pending.push(p);
      continue;
    }
    if (p.targetBuilding) {
      if (target && target.hp > 0) damage(target as Building, p.damage);
      if (p.splash)
        for (const b of battle.buildings) {
          if (b.id === p.targetId || b.hp <= 0 || isTrap(b.kind)) continue;
          const size = BUILDINGS[b.kind].size;
          if (Math.hypot(b.x + size / 2 - p.x, b.y + size / 2 - p.y) <= p.splash)
            damage(b, p.damage * (p.splashScale ?? 1));
        }
    } else if (p.splash) {
      for (const u of battle.units)
        if (
          u.hp > 0 &&
          !!TROOPS[u.kind].flying === !!p.toAir &&
          Math.hypot(u.x - p.x, u.y - p.y) <= p.splash
        )
          u.hp -= p.damage;
    } else if (target && target.hp > 0) target.hp -= p.damage;
    emit(projectileEffect(p, 'impact'));
  }
  battle.projectiles = pending;
}
