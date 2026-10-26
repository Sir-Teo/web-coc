import { BUILDINGS } from './data';
import type { Defender } from './defenders';
import { defenderHidden } from './defender-visibility';
import { garrisonDefenderTargetable } from './garrison-abilities';
import { targetableBuilding } from './hidden-tesla';
import type { Building } from './model';
import type { NativeTroopContext } from './native-troops';

export type ChainTarget = { building: Building } | { defender: Defender };
export interface ChainRef {
  id: number;
  building: boolean;
}
export const chainKey = (target: ChainTarget) =>
  'building' in target ? `building:${target.building.id}` : `defender:${target.defender.id}`;
export const chainRef = (target: ChainTarget): ChainRef =>
  'building' in target
    ? { id: target.building.id, building: true }
    : { id: target.defender.id, building: false };
export const chainPoint = (target: ChainTarget) =>
  'building' in target
    ? {
        x: target.building.x + BUILDINGS[target.building.kind].size / 2,
        y: target.building.y + BUILDINGS[target.building.kind].size / 2,
      }
    : target.defender;
const order = (a: ChainTarget, b: ChainTarget) =>
  'building' in a
    ? 'building' in b
      ? a.building.id - b.building.id
      : -1
    : 'building' in b
      ? 1
      : a.defender.id - b.defender.id;
const maximumHP = (target: ChainTarget) =>
  'building' in target ? target.building.maxHp : target.defender.maxHp;
const eligibleDefender = (ctx: NativeTroopContext, d: Defender, at: number) =>
  d.hp > 0 &&
  d.spawnedAt <= at + 1e-9 &&
  (d.invisibleUntil ?? 0) <= at + 1e-9 &&
  !defenderHidden(ctx.battle, d) &&
  garrisonDefenderTargetable(ctx.battle, d);
export function resolveChainTarget(
  ctx: NativeTroopContext,
  ref: ChainRef,
  at: number,
): ChainTarget | undefined {
  if (ref.building) {
    const b = ctx.buildingsById.get(ref.id);
    return b && b.kind !== 'wall' && targetableBuilding(ctx.battle, b)
      ? { building: b }
      : undefined;
  }
  const d = ctx.battle.defenders?.find((d) => d.id === ref.id);
  return d && eligibleDefender(ctx, d, at) ? { defender: d } : undefined;
}
/** The established edge/point adapter; Electro Dragon adds its documented maximum-HP tie break. */
export function nearestChainTarget(
  ctx: NativeTroopContext,
  from: { x: number; y: number },
  radius: number,
  hit: readonly string[],
  at: number,
  preferMaxHP = false,
): ChainTarget | undefined {
  let nearest: ChainTarget | undefined,
    best = Infinity;
  const consider = (target: ChainTarget, distance: number) => {
    if (hit.includes(chainKey(target)) || distance > radius + 1e-9) return;
    const tied = Math.abs(distance - best) <= 1e-9;
    const hp = nearest && preferMaxHP ? maximumHP(target) - maximumHP(nearest) : 0;
    if (
      distance < best - 1e-9 ||
      (tied && (!nearest || hp > 0 || (hp === 0 && order(target, nearest) < 0)))
    ) {
      nearest = target;
      best = distance;
    }
  };
  for (const b of ctx.buildings) {
    if (b.kind === 'wall' || !targetableBuilding(ctx.battle, b)) continue;
    const size = BUILDINGS[b.kind].size;
    consider(
      { building: b },
      Math.hypot(
        Math.max(b.x - from.x, 0, from.x - b.x - size),
        Math.max(b.y - from.y, 0, from.y - b.y - size),
      ),
    );
  }
  for (const d of ctx.battle.defenders ?? [])
    if (eligibleDefender(ctx, d, at))
      consider({ defender: d }, Math.hypot(d.x - from.x, d.y - from.y));
  return nearest;
}
