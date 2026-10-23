import { distance2D } from './distance';
import type { Battle } from './model';
import type { DefendingBuilder } from './defending-builder';

export interface DefendingBuilderFreeze {
  since: number;
  until: number;
  /** Simulation time held by Freeze, also removed from the character animation clock. */
  timeLost: number;
}

/** Offensive full freezes reach the invulnerable Builder, independently of his hut. */
export function freezeDefendingBuilders(
  battle: Battle,
  x: number,
  y: number,
  radius: number,
  at: number,
  duration: number,
) {
  if (!battle.nativeBuilderFreeze) return;
  for (const builder of battle.late?.defendingBuilder?.builders ?? []) {
    if (
      builder.hiddenAt !== undefined ||
      builder.spawnedAt > at + 1e-9 ||
      distance2D(builder.x - x, builder.y - y) > radius + 1e-9
    )
      continue;
    const old = builder.freeze;
    builder.freeze = {
      since: old && old.until >= at ? Math.min(old.since, at) : at,
      until: Math.max(old?.until ?? 0, at + duration),
      timeLost: old?.timeLost ?? 0,
    };
  }
}

export const defendingBuilderFrozen = (builder: DefendingBuilder, at: number) =>
  !!builder.freeze && builder.freeze.since <= at && at < builder.freeze.until;

/** Freeze holds movement, target acquisition and both halves of the repair timer. */
export function defendingBuilderActiveTime(builder: DefendingBuilder, from: number, to: number) {
  const freeze = builder.freeze;
  const held = freeze ? Math.max(0, Math.min(to, freeze.until) - Math.max(from, freeze.since)) : 0;
  if (freeze) freeze.timeLost += held;
  return Math.max(0, to - from - held);
}
