import { nativeUnitStats, unitKindForName } from './native-units';

/** Body/shot tiers reachable through source secondary units and recurring summons. */
export function spawnedTroopArtLevels(roots: ReadonlyMap<string, readonly number[]>) {
  const demand = new Map<string, number[]>();
  const pending: { kind: string; level: number }[] = [];
  const add = (kind: string, requested: number) => {
    const level = nativeUnitStats(kind, requested).level;
    const levels = demand.get(kind) ?? [];
    if (levels.includes(level)) return;
    levels.push(level);
    demand.set(
      kind,
      levels.sort((a, b) => a - b),
    );
    pending.push({ kind, level });
  };
  const named = (name: string, level: number) => {
    const kind = unitKindForName(name);
    if (kind) add(kind, level);
  };
  for (const [kind, levels] of roots) for (const level of levels) add(kind, level);
  for (let index = 0; index < pending.length; index++) {
    const { kind, level } = pending[index],
      stats = nativeUnitStats(kind, level);
    // spawnSecondaries inherits its parent's tier; spawnNativeUnit clamps the child.
    if (stats.secondaryCount > 0) named(stats.secondary, stats.level);
    // stepSummons uses the explicit SummonLevel, independently of the parent's tier.
    if (stats.summonCount > 0 && stats.summonCooldown > 0) named(stats.summon, stats.summonLevel);
  }
  return demand;
}
