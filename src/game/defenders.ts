import { TROOPS, isDefense, isResourceBuilding, isTrap, type TroopDef } from './data';
import { findPath, distanceTo, type Battle, type Building, type Unit, type FX } from './model';
import { launchProjectile } from './projectiles';
import { targetableBuilding } from './hidden-tesla';
import { SKELETON_TRAP, skeletonCount, skeletonStats, type SkeletonMode } from './skeleton-stats';

export interface Defender {
  id: number;
  kind: 'skeleton';
  sourceId: number;
  mode: SkeletonMode;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  spawnedAt: number;
  cooldown: number;
  target: number | null;
  path: { x: number; y: number }[];
  pathAt: number;
  attacking: boolean;
  alerted?: boolean;
  defeatedAt?: number;
  stunnedUntil?: number;
}
export function hurtDefender(battle: Battle, defender: Defender, power: number) {
  if (defender.hp <= 0) return;
  defender.hp = Math.max(0, defender.hp - power);
  if (!defender.hp) {
    defender.defeatedAt = battle.elapsed;
    defender.attacking = false;
  }
}
export function damageDefenders(
  battle: Battle,
  point: { x: number; y: number },
  power: number,
  radius: number,
  targets: 'ground' | 'air' | 'both' = 'ground',
  skipId?: number,
) {
  for (const enemy of battle.defenders ?? [])
    if (
      enemy.id !== skipId &&
      enemy.hp > 0 &&
      (targets === 'both' || enemy.mode === targets) &&
      Math.hypot(enemy.x - point.x, enemy.y - point.y) <= radius
    )
      hurtDefender(battle, enemy, power);
}
export function spawnSkeleton(battle: Battle, source: Building, at: number, index: number) {
  const mode = source.skeletonMode ?? 'ground',
    stats = skeletonStats(mode);
  // Small deterministic offsets keep the burst legible and inside its passable tile.
  const angle = (index * Math.PI * 2) / skeletonCount(source.level);
  const defender: Defender = {
    id: -(battle.defenders?.length ?? 0) - 1,
    kind: 'skeleton',
    sourceId: source.id,
    mode,
    x: source.x + 0.5 + Math.cos(angle) * 0.18,
    y: source.y + 0.5 + Math.sin(angle) * 0.18,
    hp: stats.hp,
    maxHp: stats.hp,
    spawnedAt: at,
    cooldown: 0,
    target: null,
    path: [],
    pathAt: 0,
    attacking: false,
  };
  (battle.defenders ??= []).push(defender);
  return defender;
}
function moveAlong(
  unit: { x: number; y: number; path: { x: number; y: number }[] },
  speed: number,
  dt: number,
) {
  let travel = speed * dt;
  while (unit.path.length && travel > 0) {
    const next = unit.path[0],
      dx = next.x - unit.x,
      dy = next.y - unit.y,
      len = Math.hypot(dx, dy);
    if (len <= travel) {
      unit.x = next.x;
      unit.y = next.y;
      unit.path.shift();
      travel -= len;
    } else {
      unit.x += (dx / len) * travel;
      unit.y += (dy / len) * travel;
      break;
    }
  }
}
export function stepDefenders(battle: Battle, dt: number, effect: (fx: FX) => void) {
  const structures = battle.buildings.filter((b) => b.kind !== 'wall'); // Home defenders jump their own walls.
  for (const defender of battle.defenders ?? []) {
    defender.attacking = false;
    if (defender.hp <= 0) continue;
    const activeDt = Math.min(
      dt,
      Math.max(
        0,
        battle.elapsed -
          Math.max(defender.spawnedAt + SKELETON_TRAP.spawnIdle, defender.stunnedUntil ?? 0),
      ),
    );
    if (activeDt <= 0) continue;
    const stats = skeletonStats(defender.mode),
      eligible = battle.units.filter((u) => u.hp > 0 && !!TROOPS[u.kind].flying === stats.flying);
    const target =
      eligible.find((u) => u.id === defender.target) ??
      eligible.sort(
        (a, b) =>
          Math.hypot(a.x - defender.x, a.y - defender.y) -
            Math.hypot(b.x - defender.x, b.y - defender.y) || a.id - b.id,
      )[0];
    const cooling = defender.cooldown > 0;
    defender.cooldown -= activeDt;
    defender.pathAt -= activeDt;
    if (!target) {
      defender.target = null;
      defender.path = [];
      continue;
    }
    if (defender.target !== target.id) {
      defender.target = target.id;
      defender.path = [];
      defender.pathAt = 0;
    }
    const distance = Math.hypot(target.x - defender.x, target.y - defender.y);
    if (distance <= stats.range + 1e-6) {
      defender.attacking = true;
      if (defender.cooldown <= 0) {
        defender.cooldown = Math.max(0, stats.rate + (cooling ? defender.cooldown : 0));
        defender.alerted = true;
        target.hp -= stats.damage;
        effect({
          type: 'hit',
          sourceDefender: true,
          sourceId: defender.id,
          targetId: target.id,
          x: defender.x,
          y: defender.y,
          toX: target.x,
          toY: target.y,
          fromAir: stats.flying,
          toAir: stats.flying,
        });
      }
    } else if (stats.flying) {
      const move = Math.min(stats.speed * activeDt, distance);
      defender.x += ((target.x - defender.x) / distance) * move;
      defender.y += ((target.y - defender.y) / distance) * move;
    } else {
      if (!defender.path.length || defender.pathAt <= 0) {
        defender.path = findPath(defender, target, structures, stats.range);
        defender.pathAt = 0.3;
      }
      moveAlong(defender, stats.speed, activeDt);
    }
  }
}
const canFight = (unit: Unit, enemy: Defender) =>
  !TROOPS[unit.kind].healer &&
  !TROOPS[unit.kind].wallBreaker &&
  (enemy.mode === 'ground' ||
    unit.kind === 'archer' ||
    unit.kind === 'wizard' ||
    unit.kind === 'dragon');
type AttackStats = Pick<TroopDef, 'damage' | 'speed' | 'range' | 'rate'>;
export function stepAttackerVsDefenders(
  battle: Battle,
  unit: Unit,
  stats: AttackStats,
  dt: number,
  buildings: Building[],
  damage: (b: Building, power: number) => void,
  effect: (fx: FX) => void,
) {
  const troop = TROOPS[unit.kind];
  const preferred = buildings.some(
    (b) =>
      b.hp > 0 &&
      targetableBuilding(battle, b) &&
      ((troop.prefersDefenses && isDefense(b.kind)) ||
        (troop.prefersResources && isResourceBuilding(b.kind))),
  );
  // Preferred-target troops finish their current building before accepting an alert.
  const committed =
    (troop.prefersDefenses || troop.prefersResources) &&
    buildings.some((b) => b.id === unit.target && b.hp > 0 && targetableBuilding(battle, b));
  if (preferred || committed || troop.healer || troop.wallBreaker) {
    delete unit.defenderTarget;
    return false;
  }
  let target = (battle.defenders ?? []).find(
    (d) => d.id === unit.defenderTarget && d.hp > 0 && canFight(unit, d),
  );
  if (!target) {
    target = (battle.defenders ?? [])
      .filter(
        (d) =>
          d.hp > 0 &&
          d.alerted &&
          canFight(unit, d) &&
          Math.hypot(d.x - unit.x, d.y - unit.y) <= SKELETON_TRAP.alertRadius,
      )
      .sort(
        (a, b) =>
          Math.hypot(a.x - unit.x, a.y - unit.y) - Math.hypot(b.x - unit.x, b.y - unit.y) ||
          b.id - a.id,
      )[0];
    if (!target) {
      if (unit.defenderTarget !== undefined) {
        delete unit.defenderTarget;
        unit.target = null;
        unit.path = [];
        unit.pathAt = 0;
      }
      return false;
    }
    unit.defenderTarget = target.id;
    unit.path = [];
    unit.pathAt = 0;
  }
  const distance = Math.hypot(unit.x - target.x, unit.y - target.y);
  if (distance <= stats.range + 1e-6) {
    unit.attacking = true;
    if (unit.cooldown <= 0) {
      unit.cooldown = stats.rate;
      if (unit.kind === 'dragon') {
        hurtDefender(battle, target, stats.damage);
        damageDefenders(battle, target, stats.damage, troop.splash ?? 0, target.mode, target.id);
        if (target.mode === 'ground')
          for (const b of buildings)
            if (b.hp > 0 && !isTrap(b.kind) && distanceTo(target, b) <= (troop.splash ?? 0))
              damage(b, stats.damage);
        effect({
          type: 'breath',
          targetDefender: true,
          targetId: target.id,
          sourceId: unit.id,
          x: unit.x,
          y: unit.y,
          toX: target.x,
          toY: target.y,
          fromAir: true,
          toAir: target.mode === 'air',
        });
      } else if (stats.range > 2 || troop.flying) {
        launchProjectile(
          battle,
          {
            weapon: troop.flying ? 'bomb' : unit.kind === 'wizard' ? 'fireball' : 'arrow',
            sourceId: unit.id,
            targetId: target.id,
            targetBuilding: false,
            targetDefender: true,
            fromX: unit.x,
            fromY: unit.y,
            x: target.x,
            y: target.y,
            fromAir: troop.flying,
            toAir: target.mode === 'air',
            damage: stats.damage,
            splash: troop.splash,
          },
          effect,
        );
      } else {
        hurtDefender(battle, target, stats.damage);
        effect({
          type: 'hit',
          targetDefender: true,
          targetId: target.id,
          sourceId: unit.id,
          x: unit.x,
          y: unit.y,
          toX: target.x,
          toY: target.y,
        });
      }
    }
  } else if (troop.flying) {
    const move = Math.min(stats.speed * dt, distance);
    unit.x += ((target.x - unit.x) / distance) * move;
    unit.y += ((target.y - unit.y) / distance) * move;
  } else {
    if (!unit.path.length || unit.pathAt <= 0) {
      unit.path = findPath(unit, target, buildings, stats.range);
      unit.pathAt = 0.3;
    }
    const next = unit.path[0],
      wall =
        next &&
        buildings.find(
          (b) =>
            b.kind === 'wall' &&
            b.hp > 0 &&
            b.x === Math.floor(next.x) &&
            b.y === Math.floor(next.y),
        );
    if (wall && distanceTo(unit, wall) <= stats.range) {
      unit.attacking = true;
      if (unit.cooldown <= 0) {
        unit.cooldown = stats.rate;
        if (stats.range > 2) {
          launchProjectile(
            battle,
            {
              weapon: unit.kind === 'wizard' ? 'fireball' : 'arrow',
              sourceId: unit.id,
              targetId: wall.id,
              targetBuilding: true,
              fromX: unit.x,
              fromY: unit.y,
              x: wall.x + 0.5,
              y: wall.y + 0.5,
              damage: stats.damage,
              splash: troop.splash,
            },
            effect,
          );
        } else {
          damage(wall, stats.damage);
          effect({ type: 'hit', x: wall.x + 0.5, y: wall.y + 0.5 });
        }
      }
    } else moveAlong(unit, stats.speed, dt);
  }
  return true;
}
