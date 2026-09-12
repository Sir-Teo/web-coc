import { BUILDINGS, TROOPS, isTrap } from './data';
import type { Battle, Building, FX } from './model';
import { healerContribution, HEALER_HERO_SCALE } from './healing';
import { damageDefenders, hurtDefender, type Defender } from './defenders';

export type Weapon =
  'arrow' | 'cannonball' | 'rocket' | 'fireball' | 'bomb' | 'towerbomb' | 'arcane' | 'healing';
export interface CombatProjectile {
  id: string;
  weapon: Weapon;
  sourceId: number;
  targetId: number;
  targetBuilding: boolean;
  targetDefender?: boolean;
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
}

// Tiles/second. Wizard fireballs and Bomb Tower bombs use client values;
// other weapons retain local tuning. Flight follows battle time, including replays.
const SPEED: Record<Weapon, number> = {
  arrow: 18,
  cannonball: 16,
  rocket: 22,
  fireball: 5,
  bomb: 10,
  towerbomb: 8,
  arcane: 16,
  healing: 12,
};
function buildingAim(p: Pick<CombatProjectile, 'weapon' | 'fromX' | 'fromY'>, b: Building) {
  const size = BUILDINGS[b.kind].size;
  // Bombs drop onto the approached edge of the footprint. Forcing the far
  // center could send a falling bomb upward across a tall building's artwork.
  return p.weapon === 'bomb'
    ? {
        x: Math.max(b.x, Math.min(p.fromX, b.x + size)),
        y: Math.max(b.y, Math.min(p.fromY, b.y + size)),
      }
    : { x: b.x + size / 2, y: b.y + size / 2 };
}
export function launchProjectile(
  battle: Battle,
  shot: Omit<CombatProjectile, 'id' | 'launched' | 'impact'>,
  emit: (fx: FX) => void,
) {
  const duration =
    shot.weapon === 'bomb'
      ? 0.33
      : Math.max(
          shot.weapon === 'healing' || shot.weapon === 'towerbomb' || shot.weapon === 'fireball'
            ? 0.01
            : 0.12,
          Math.hypot(shot.x - shot.fromX, shot.y - shot.fromY) / SPEED[shot.weapon],
        );
  const projectile: CombatProjectile = {
    ...shot,
    id: `${shot.sourceId}:${battle.elapsed}`,
    launched: battle.elapsed,
    impact: battle.elapsed + duration,
  };
  const target = shot.targetBuilding && battle.buildings.find((b) => b.id === shot.targetId);
  if (target && shot.weapon === 'bomb') Object.assign(projectile, buildingAim(shot, target));
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
    targetDefender: p.targetDefender,
    fromAir: p.fromAir,
    toAir: p.toAir,
    radius: p.splash,
  };
}

/** Resolve once even if the shooter died. Direct shots never switch targets. */
export function stepProjectiles(
  battle: Battle,
  damage: (target: Building, power: number, at: number) => void,
  emit: (fx: FX) => void,
) {
  const pending: CombatProjectile[] = [];
  for (const p of [...(battle.projectiles ?? [])].sort((a, b) => a.impact - b.impact)) {
    const target = p.targetDefender
      ? battle.defenders?.find((d) => d.id === p.targetId)
      : p.targetBuilding
        ? battle.buildings.find((b) => b.id === p.targetId)
        : battle.units.find((u) => u.id === p.targetId);
    if (
      target &&
      target.hp > 0 &&
      p.weapon !== 'healing' &&
      p.weapon !== 'towerbomb' &&
      p.weapon !== 'fireball'
    ) {
      const aim = p.targetBuilding ? buildingAim(p, target as Building) : target;
      p.x = aim.x;
      p.y = aim.y;
    }
    if (p.impact > battle.elapsed + 1e-9) {
      pending.push(p);
      continue;
    }
    if (p.weapon === 'healing') {
      for (const unit of battle.units)
        if (
          unit.hp > 0 &&
          !TROOPS[unit.kind].flying &&
          Math.hypot(unit.x - p.x, unit.y - p.y) <= (p.splash ?? 0)
        )
          unit.hp = Math.min(
            unit.maxHp,
            unit.hp +
              p.damage *
                healerContribution(battle, unit, p.sourceId) *
                (unit.hero ? HEALER_HERO_SCALE : 1),
          );
    } else if (p.targetDefender) {
      if (p.splash) {
        damageDefenders(battle, p, p.damage, p.splash, p.toAir ? 'air' : 'ground');
        if (!p.toAir)
          for (const b of battle.buildings) {
            if (b.hp <= 0 || isTrap(b.kind)) continue;
            const size = BUILDINGS[b.kind].size;
            if (
              Math.hypot(
                Math.max(b.x - p.x, 0, p.x - b.x - size),
                Math.max(b.y - p.y, 0, p.y - b.y - size),
              ) <= p.splash
            )
              damage(b, p.damage, p.impact);
          }
      } else if (target && target.hp > 0) hurtDefender(battle, target as Defender, p.damage);
    } else if (p.targetBuilding) {
      if (target && target.hp > 0) damage(target as Building, p.damage, p.impact);
      if (p.splash) damageDefenders(battle, p, p.damage, p.splash, 'ground');
      if (p.splash)
        for (const b of battle.buildings) {
          if (b.id === p.targetId || b.hp <= 0 || isTrap(b.kind)) continue;
          const size = BUILDINGS[b.kind].size;
          const distance = Math.hypot(
            Math.max(b.x - p.x, 0, p.x - b.x - size),
            Math.max(b.y - p.y, 0, p.y - b.y - size),
          );
          if (distance <= p.splash) damage(b, p.damage, p.impact);
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
