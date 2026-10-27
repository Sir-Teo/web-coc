import { BUILDINGS } from './data';
import { defenderHidden } from './defender-visibility';
import { garrisonDefenderTargetable } from './garrison-abilities';
import { targetableBuilding } from './hidden-tesla';
import { distance2D } from './distance';
import { distanceTo, type Battle, type Unit } from './model';
import { hurtDefender } from './defenders';
import { tickDefenderHitPoison } from './defender-hit-poison';
import { nativeRow, num, text, tiles } from './native-data';
import type { HeroAbility } from './native-heroes';
import type { NativeTroopContext } from './native-troops';
import { launchProjectile, type CombatProjectile } from './projectiles';

export interface SpikyBallCast {
  id: string;
  sourceId: number;
  level: number;
  at: number;
  x: number;
  y: number;
  shots: CombatProjectile[];
}
interface Target {
  id: number;
  x: number;
  y: number;
  building: boolean;
  distance: number;
}
const key = (target: { id: number; building: boolean }) =>
  `${target.building ? 'b' : 'd'}:${target.id}`;

/** Copy a valid current target first; later contacts choose from the last landing point. */
function choose(
  battle: Battle,
  from: { x: number; y: number },
  at: number,
  visited: readonly string[],
  reach = Infinity,
  current?: Unit,
) {
  const seen = new Set(visited);
  const buildings: Target[] = battle.buildings
    .filter((b) => b.kind !== 'wall' && !seen.has(`b:${b.id}`) && targetableBuilding(battle, b))
    .map((b) => ({
      id: b.id,
      x: b.x + BUILDINGS[b.kind].size / 2,
      y: b.y + BUILDINGS[b.kind].size / 2,
      building: true,
      distance: distanceTo(from, b),
    }))
    .filter((target) => target.distance <= reach + 1e-9);
  const order = (a: Target, b: Target) => a.distance - b.distance || a.id - b.id;
  if (buildings.length)
    return buildings.find((b) => b.id === current?.target) ?? buildings.sort(order)[0];
  const defenders: Target[] = (battle.defenders ?? [])
    .filter(
      (d) =>
        d.hp > 0 &&
        d.mode !== 'air' &&
        d.kind !== 'repairer' &&
        d.spawnedAt <= at + 1e-9 &&
        !seen.has(`d:${d.id}`) &&
        !defenderHidden(battle, d) &&
        garrisonDefenderTargetable(battle, d),
    )
    .map((d) => ({
      id: d.id,
      x: d.x,
      y: d.y,
      building: false,
      distance: distance2D(d.x - from.x, d.y - from.y),
    }))
    .filter((target) => target.distance <= reach + 1e-9);
  return defenders.find((d) => d.id === current?.defenderTarget) ?? defenders.sort(order)[0];
}

function send(
  ctx: NativeTroopContext,
  cast: SpikyBallCast,
  shot: Omit<CombatProjectile, 'id' | 'launched' | 'impact'>,
  at: number,
) {
  const packet = launchProjectile(ctx.battle, shot, ctx.effect, at);
  const marker = packet.native!.spikyBall!;
  cast.shots.push({
    ...packet,
    native: { ...packet.native!, spikyBall: { ...marker, visited: [...marker.visited] } },
  });
}

export function launchSpikyBall(
  ctx: NativeTroopContext,
  unit: Unit,
  ability: HeroAbility,
  at: number,
) {
  const battle = ctx.battle;
  if (!battle.nativeSpikyBall || ability.name !== 'FootballBounce') return;
  const cast: SpikyBallCast = {
    id: `spiky-ball:${unit.id}:${at}`,
    sourceId: unit.id,
    level: ability.level,
    at,
    x: unit.x,
    y: unit.y,
    shots: [],
  };
  (battle.nativeSpikyBallCasts ??= []).push(cast);
  const target = choose(battle, unit, at, [], Infinity, unit);
  if (!target) return;
  const name = text(ability.row, 'ProjectileOnActivation');
  send(
    ctx,
    cast,
    {
      weapon: 'native',
      native: {
        name,
        kind: unit.kind,
        level: unit.level ?? 1,
        captureSource: true,
        spikyBall: {
          castId: cast.id,
          index: 0,
          left: num(ability.row, 'ProjectileBounces'),
          reach: tiles(nativeRow('projectiles', name), 'MaxBounceDistance'),
          visited: [key(target)],
        },
      },
      sourceId: unit.id,
      targetId: target.id,
      targetBuilding: target.building,
      ...(!target.building ? { targetDefender: true } : {}),
      fromX: unit.x,
      fromY: unit.y,
      x: target.x,
      y: target.y,
      damage: num(ability.row, 'Damage'),
    },
    at,
  );
}

/** Each arrival spends one distinct target; captured damage survives the King's departure. */
export function resolveSpikyBall(ctx: NativeTroopContext, shot: CombatProjectile) {
  const battle = ctx.battle;
  const marker = shot.native?.spikyBall;
  if (!battle.nativeSpikyBall || !marker) return false;
  const cast = battle.nativeSpikyBallCasts?.find((entry) => entry.id === marker.castId);
  if (!cast) return true;
  if (shot.targetBuilding) {
    const target = battle.buildings.find((b) => b.id === shot.targetId);
    if (target && target.hp > 0) ctx.damageBuilding(target, shot.damage, shot.impact);
  } else if (shot.targetDefender) {
    const target = battle.defenders?.find((d) => d.id === shot.targetId);
    if (target && target.hp > 0 && target.spawnedAt <= shot.impact + 1e-9) {
      if (battle.nativeAttackerHitPoison) tickDefenderHitPoison(target, shot.impact);
      hurtDefender(battle, target, shot.damage, shot.impact);
    }
  }
  const next = marker.left > 0 && choose(battle, shot, shot.impact, marker.visited, marker.reach);
  if (!next) return true;
  marker.continues = true;
  cast.shots[marker.index].native!.spikyBall!.continues = true;
  send(
    ctx,
    cast,
    {
      weapon: 'native',
      native: {
        ...shot.native!,
        bounce: marker.index + 1,
        spikyBall: {
          castId: marker.castId,
          index: marker.index + 1,
          left: marker.left - 1,
          reach: marker.reach,
          visited: [...marker.visited, key(next)],
        },
      },
      sourceId: shot.sourceId,
      targetId: next.id,
      targetBuilding: next.building,
      ...(!next.building ? { targetDefender: true } : {}),
      fromX: shot.x,
      fromY: shot.y,
      x: next.x,
      y: next.y,
      damage: shot.damage,
    },
    shot.impact,
  );
  return true;
}
