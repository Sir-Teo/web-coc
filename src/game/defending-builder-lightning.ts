import { distance2D } from './distance';
import type { Battle } from './model';

/** Attacker Lightning resets the repair target of every active Builder inside the strike. */
export function defendingBuilderLightning(
  battle: Battle,
  x: number,
  y: number,
  radius: number,
  at = battle.elapsed,
) {
  for (const builder of battle.late?.defendingBuilder?.builders ?? []) {
    if (builder.hiddenAt !== undefined || builder.retreating) continue;
    if (builder.spawnedAt > at || distance2D(builder.x - x, builder.y - y) > radius) continue;
    builder.target = null;
    builder.repairing = false;
    delete builder.engaged;
    builder.path = [];
    builder.pathAt = 0;
  }
}
