import type { TroopKind } from './data';
import { num } from './native-data';
import { SIEGE_BARRACKS_KINDS } from './native-siege-barracks';
import { nativeUnitRow, nativeUnitStats, unitKindForName } from './native-units';

interface SpawnedTroopArtOptions {
  researchedLevel?: (kind: TroopKind) => number;
  /** Older Siege Barracks recordings inherited the second name as their primary kind. */
  siegeBarracksTroops?: boolean;
}

/** Body/shot tiers reachable through source secondary units and recurring summons. */
export function spawnedTroopArtLevels(
  roots: ReadonlyMap<string, readonly number[]>,
  { researchedLevel = () => 1, siegeBarracksTroops = true }: SpawnedTroopArtOptions = {},
) {
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
    if (stats.bunkerCount > 0 && stats.bunkerDecay > 0) {
      if (kind === 'siegebarracks') {
        const primary = siegeBarracksTroops
          ? SIEGE_BARRACKS_KINDS[0]
          : (unitKindForName(stats.bunker) as TroopKind);
        add(primary, researchedLevel(primary));
        if (num(nativeUnitRow(kind, level), 'BunkerTroopCount2') > 0) {
          const secondary = SIEGE_BARRACKS_KINDS[1];
          add(secondary, researchedLevel(secondary));
        }
      } else named(stats.bunker, stats.level);
    }
  }
  return demand;
}
