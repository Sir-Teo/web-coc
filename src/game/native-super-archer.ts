import { BUILDINGS } from './data';
import { distance2D } from './distance';
import { chainKey, chainPoint, chainRef, type ChainRef, type ChainTarget } from './chain-targets';
import { hurtDefender } from './defenders';
import { presentBuilding } from './hidden-tesla';
import { nativeRow, num, tiles } from './native-data';
import { nativeUnitRow, nativeUnitStats } from './native-units';
import type { Unit } from './model';
import type { NativeTroopContext } from './native-troops';

export interface ArcherPiercingShot {
  id: string;
  sourceId: number;
  level: number;
  projectile: string;
  fromX: number;
  fromY: number;
  dirX: number;
  dirY: number;
  length: number;
  speed: number;
  radius: number;
  launched: number;
  travelled: number;
  damage: number;
  hit: { target: ChainRef; at: number; x: number; y: number; air: boolean }[];
}
const EPS = 1e-9;
export function launchArcherPiercing(
  ctx: NativeTroopContext,
  unit: Unit,
  damage: number,
  target: ChainTarget,
) {
  const s = nativeUnitStats('superarcher', unit.level ?? ctx.battle.troopLevels?.superarcher ?? 1),
    row = nativeUnitRow('superarcher', s.level),
    point = chainPoint(target),
    dx = point.x - unit.x,
    dy = point.y - unit.y,
    length = distance2D(dx, dy),
    state = (unit.native ??= {});
  state.attacks = (state.attacks ?? 0) + 1;
  state.lastAttackAt = ctx.battle.elapsed;
  (ctx.battle.nativeArcherShots ??= []).push({
    id: `superarcher:${unit.id}:${state.attacks}`,
    sourceId: unit.id,
    level: s.level,
    projectile: s.projectile,
    fromX: unit.x,
    fromY: unit.y,
    dirX: length > EPS ? dx / length : 1,
    dirY: length > EPS ? dy / length : 0,
    length: length + tiles(row, 'PenetratingExtraRange'),
    speed: num(nativeRow('projectiles', s.projectile), 'Speed') / 100,
    radius: tiles(row, 'PenetratingRadius'),
    launched: ctx.battle.elapsed,
    travelled: 0,
    damage,
    hit: [],
  });
}
/** Local collision adapter: a source-width ray against expanded building footprints. */
function rectangle(
  shot: ArcherPiercingShot,
  x: number,
  y: number,
  size: number,
): [number, number] | undefined {
  let entry = -Infinity,
    exit = Infinity;
  for (const [origin, direction, low, high] of [
    [shot.fromX, shot.dirX, x - shot.radius, x + size + shot.radius],
    [shot.fromY, shot.dirY, y - shot.radius, y + size + shot.radius],
  ]) {
    if (direction === 0) {
      if (origin < low - EPS || origin > high + EPS) return;
      continue;
    }
    const a = (low - origin) / direction,
      b = (high - origin) / direction;
    entry = Math.max(entry, Math.min(a, b));
    exit = Math.min(exit, Math.max(a, b));
    if (entry > exit + EPS) return;
  }
  return [entry, exit];
}
function circle(shot: ArcherPiercingShot, x: number, y: number): [number, number] | undefined {
  const dx = x - shot.fromX,
    dy = y - shot.fromY,
    along = dx * shot.dirX + dy * shot.dirY,
    across = Math.abs(dx * shot.dirY - dy * shot.dirX);
  if (across > shot.radius + EPS) return;
  const half = Math.sqrt(Math.max(0, shot.radius * shot.radius - across * across));
  return [along - half, along + half];
}
/** Advance fixed arrows through both enemy layers; collateral invisibility does not grant immunity. */
export function stepPiercingShots<T extends ArcherPiercingShot>(
  ctx: NativeTroopContext,
  shots: readonly T[],
  power?: (shot: T, target: ChainTarget, at: number) => number,
  resolved?: (shot: T, target: ChainTarget, at: number, damaged: boolean) => void,
) {
  const b = ctx.battle;
  const candidates: (ChainTarget & { shot: T; at: number })[] = [];
  for (const shot of shots) {
    const from = shot.travelled,
      travelled = Math.min(shot.length, Math.max(0, b.elapsed - shot.launched) * shot.speed);
    if (travelled <= from + EPS) continue;
    shot.travelled = travelled;
    const visited = new Set(
      shot.hit.map((h) => `${h.target.building ? 'building' : 'defender'}:${h.target.id}`),
    );
    const consider = (
      target: ChainTarget,
      span: [number, number] | undefined,
      availableAt = shot.launched,
    ) => {
      if (!span || visited.has(chainKey(target))) return;
      const distance = Math.max(0, from, span[0], (availableAt - shot.launched) * shot.speed);
      if (distance > travelled + EPS || distance > span[1] + EPS) return;
      candidates.push({ ...target, shot, at: shot.launched + distance / shot.speed });
    };
    for (const building of b.buildings)
      if (presentBuilding(b, building))
        consider(
          { building },
          rectangle(shot, building.x, building.y, BUILDINGS[building.kind].size),
          building.kind === 'tesla' ? b.revealedTeslas?.[building.id] : undefined,
        );
    for (const defender of b.defenders ?? [])
      if (defender.hp > 0 && defender.kind !== 'repairer')
        consider({ defender }, circle(shot, defender.x, defender.y), defender.spawnedAt);
  }
  candidates.sort(
    (a, c) =>
      a.at - c.at ||
      a.shot.sourceId - c.shot.sourceId ||
      a.shot.launched - c.shot.launched ||
      Number('building' in c) - Number('building' in a) ||
      chainRef(a).id - chainRef(c).id,
  );
  for (const target of candidates) {
    if (('building' in target ? target.building.hp : target.defender.hp) <= 0) continue;
    const { shot, at } = target,
      point = chainPoint(target),
      ref = chainRef(target);
    shot.hit.push({
      target: ref,
      at,
      x: point.x,
      y: point.y,
      air: 'defender' in target && target.defender.mode === 'air',
    });
    const damage = power ? power(shot, target, at) : shot.damage;
    const before = 'building' in target ? target.building.hp : target.defender.hp;
    if ('building' in target) ctx.damageBuilding(target.building, damage, at);
    else hurtDefender(b, target.defender, damage, at);
    resolved?.(
      shot,
      target,
      at,
      ('building' in target ? target.building.hp : target.defender.hp) < before,
    );
  }
}

export function stepArcherPiercing(ctx: NativeTroopContext) {
  const b = ctx.battle;
  if (!b.nativeArcherPiercing || !b.nativeArcherShots?.length) return;
  stepPiercingShots(ctx, b.nativeArcherShots);
  b.nativeArcherShots = b.nativeArcherShots.filter(
    (s) => s.launched + s.length / s.speed + 10 >= b.elapsed - EPS,
  );
}
