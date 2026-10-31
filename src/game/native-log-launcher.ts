import type { ArcherPiercingShot } from './native-super-archer';
import type { NativeTroopContext } from './native-troops';
import type { Unit } from './model';
import { distanceTo } from './model';
import { nativeUnitRow, nativeUnitStats, type NativeUnitStats } from './native-units';
import { nativeRow, num, seconds, tiles } from './native-data';
import { chainPoint, chainRef, type ChainTarget } from './chain-targets';
import { damageDefenders } from './defenders';
import { distance2D } from './distance';
import { presentBuilding } from './hidden-tesla';
import { buildingImmune } from './native-status';

export interface RollingLogShot extends ArcherPiercingShot {
  logLauncher: true;
  buildings: number;
  maximumBuildings: number;
  stopped?: 'limit' | 'overgrowth';
}
const cache = new Map<number, ReturnType<typeof resolveStats>>();
function resolveStats(level: number) {
  const stats = nativeUnitStats('loglauncher', level),
    row = nativeUnitRow('loglauncher', stats.level),
    projectile = nativeRow('projectiles', stats.projectile);
  if (seconds(row, 'Damage2Delay') !== 0) throw Error('Unsupported delayed Log Launcher blast');
  return {
    range: stats.range + tiles(row, 'PenetratingExtraRange'),
    radius: tiles(row, 'PenetratingRadius'),
    speed: num(projectile, 'Speed') / 100,
    maximumBuildings: num(projectile, 'MaxHitBuildings'),
    blastDamage: num(row, 'Damage2'),
    blastRadius: tiles(row, 'Damage2Radius'),
    wallMultiplier: stats.preferredMultiplier,
    healthLoss: stats.loseHp / stats.loseHpInterval,
  };
}
export function logLauncherStats(level: number) {
  let result = cache.get(level);
  if (!result) cache.set(level, (result = resolveStats(level)));
  return result;
}
export const isRollingLog = (shot: ArcherPiercingShot): shot is RollingLogShot =>
  'logLauncher' in shot && shot.logLauncher === true;

/** Preserve the moving fire clock; capture a finite rolling corridor and an immediate local blast. */
export function launchRollingLog(
  ctx: NativeTroopContext,
  unit: Unit,
  stats: NativeUnitStats,
  damage: number,
  target: ChainTarget,
) {
  const ability = logLauncherStats(stats.level),
    point = chainPoint(target),
    dx = point.x - unit.x,
    dy = point.y - unit.y,
    distance = distance2D(dx, dy),
    at = ctx.battle.elapsed,
    state = (unit.native ??= {});
  state.attacks = (state.attacks ?? 0) + 1;
  state.lastAttackAt = at;
  (ctx.battle.nativeRollingLogs ??= []).push({
    id: `log:${unit.id}:${state.attacks}`,
    sourceId: unit.id,
    level: stats.level,
    projectile: stats.projectile,
    fromX: unit.x,
    fromY: unit.y,
    dirX: distance > 1e-9 ? dx / distance : 1,
    dirY: distance > 1e-9 ? dy / distance : 0,
    length: ability.range,
    radius: ability.radius,
    speed: ability.speed,
    launched: at,
    travelled: 0,
    damage,
    hit: [],
    logLauncher: true,
    buildings: 0,
    maximumBuildings: ability.maximumBuildings,
  });
  const blast = ability.blastDamage * (damage / stats.damage);
  for (const building of ctx.buildings)
    if (
      presentBuilding(ctx.battle, building) &&
      distanceTo(unit, building) <= ability.blastRadius + 1e-9
    )
      ctx.damageBuilding(
        building,
        blast * (building.kind === 'wall' ? ability.wallMultiplier : 1),
        at,
      );
  damageDefenders(ctx.battle, unit, blast, ability.blastRadius, 'ground', undefined, at);
  ctx.effect({
    type: 'blast',
    sourceId: unit.id,
    x: unit.x,
    y: unit.y,
    radius: ability.blastRadius,
    at,
  });
}

/** The existing corridor adapter owns chronology and geometry; logs stop at their own budget. */
export function rollingLogAccepts(shot: RollingLogShot, target: ChainTarget) {
  return !shot.stopped && ('building' in target || target.defender.mode === 'ground');
}
export function rollingLogDamage(
  ctx: NativeTroopContext,
  shot: RollingLogShot,
  target: ChainTarget,
  at: number,
) {
  if ('building' in target && buildingImmune(ctx.battle, target.building, at)) return 0;
  return (
    shot.damage *
    ('building' in target && target.building.kind === 'wall'
      ? logLauncherStats(shot.level).wallMultiplier
      : 1)
  );
}
export function rollingLogHit(
  ctx: NativeTroopContext,
  shot: RollingLogShot,
  target: ChainTarget,
  at: number,
) {
  if ('building' in target) {
    shot.buildings++;
    if (buildingImmune(ctx.battle, target.building, at)) shot.stopped = 'overgrowth';
    else if (shot.buildings >= shot.maximumBuildings) shot.stopped = 'limit';
    if (shot.stopped) {
      shot.length = Math.min(shot.length, Math.max(0, (at - shot.launched) * shot.speed));
      shot.travelled = Math.min(shot.travelled, shot.length);
    }
  }
  const point = chainPoint(target),
    ref = chainRef(target);
  ctx.effect({
    type: 'impact',
    weapon: 'native',
    projectileId: shot.id,
    sourceId: shot.sourceId,
    sourceKind: 'loglauncher',
    sourceLevel: shot.level,
    targetId: ref.id,
    targetBuilding: ref.building,
    ...(!ref.building ? { targetDefender: true } : {}),
    x: shot.fromX,
    y: shot.fromY,
    toX: point.x,
    toY: point.y,
    at,
  });
}
