import type { Battle } from './model';
import {
  garrisonStats,
  garrisonSecondaryLevel,
  garrisonSummonLevel,
  isGarrisonKind,
  spawnedGarrisonKind,
  type GarrisonKind,
} from './garrison-kinds';
import { armedBuilderHut } from './builder-hut';
import { defendingBuilderStats, hutBuilderLevel } from './defending-builder';
import { ghostTrapSource } from './ghost-trap';

/** All defender bodies a battle can draw, including secondary troops and future summons. */
export function defenderAnimations(battle: Battle): ReadonlySet<string> {
  const animations = new Set<string>(),
    visited = new Set<string>();
  const visit = (kind: GarrisonKind, level: number) => {
    const key = `${kind}:${level}`;
    if (visited.has(key)) return;
    visited.add(key);
    const stats = garrisonStats(kind, level);
    animations.add(stats.animation);
    if (stats.secondary) {
      const child = spawnedGarrisonKind(stats.secondary.character),
        childLevel = garrisonSecondaryLevel(stats);
      if (child && childLevel !== undefined) visit(child, childLevel);
    }
    if (stats.summon) {
      const child = spawnedGarrisonKind(stats.summon.character),
        childLevel = garrisonSummonLevel(stats);
      if (child && childLevel !== undefined) visit(child, childLevel);
    }
  };
  for (const reserve of battle.garrisons ?? [])
    for (const troop of reserve.troops) visit(troop.kind, troop.level);
  for (const defender of battle.defenders ?? [])
    if (isGarrisonKind(defender.kind) && 'level' in defender) visit(defender.kind, defender.level);
  for (const building of battle.buildings) {
    if (building.npc === 'ghost-trap') {
      const ghost = ghostTrapSource();
      if (ghost.kind) visit(ghost.kind, ghost.level);
    }
    if (armedBuilderHut(battle, building)) {
      const level = hutBuilderLevel(building.level);
      if (level !== undefined) animations.add(defendingBuilderStats(level).animation);
    }
  }
  for (const builder of battle.late?.defendingBuilder?.builders ?? [])
    animations.add(defendingBuilderStats(builder.level).animation);
  return animations;
}
