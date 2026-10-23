import { distance2D } from './distance';
import type { Battle } from './model';
import type { DefendingBuilder } from './defending-builder';

export interface DefendingBuilderPoison {
  since: number;
  until: number;
  /** Native SpeedBoost and AttackSpeedBoost, as signed fractions. */
  speed: number;
  attack: number;
}

/** The invulnerable worker takes the cloud's slows without its hitpoint damage. */
export function poisonDefendingBuilders(
  battle: Battle,
  x: number,
  y: number,
  radius: number,
  at: number,
  duration: number,
  speed: number,
  attack: number,
) {
  if (!battle.nativeBuilderPoison) return;
  for (const builder of battle.late?.defendingBuilder?.builders ?? []) {
    if (
      builder.hiddenAt !== undefined ||
      builder.spawnedAt > at + 1e-9 ||
      distance2D(builder.x - x, builder.y - y) > radius + 1e-9
    )
      continue;
    const old = builder.poison && builder.poison.until >= at ? builder.poison : undefined;
    builder.poison = {
      since: old?.since ?? at,
      until: Math.max(old?.until ?? at, at + duration),
      speed: Math.min(old?.speed ?? 0, speed),
      attack: Math.min(old?.attack ?? 0, attack),
    };
  }
}

export const defendingBuilderPoisoned = (builder: DefendingBuilder, at: number) =>
  !!builder.poison && builder.poison.since <= at && at < builder.poison.until;

/** Only the poisoned, unfrozen portion of a step loses movement and repair time. */
export function defendingBuilderPoisonTime(
  builder: DefendingBuilder,
  from: number,
  to: number,
  activeDt: number,
) {
  const poison = builder.poison;
  if (!poison) return { move: activeDt, repair: activeDt };
  const start = Math.max(from, poison.since);
  const end = Math.min(to, poison.until);
  const freeze = builder.freeze;
  const frozen = freeze
    ? Math.max(0, Math.min(end, freeze.until) - Math.max(start, freeze.since))
    : 0;
  const slowed = Math.max(0, end - start - frozen);
  return {
    move: activeDt - slowed * (1 - Math.max(0, 1 + poison.speed)),
    repair: activeDt - slowed * (1 - Math.max(0.05, 1 + poison.attack)),
  };
}
