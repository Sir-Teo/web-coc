import type { UnitKind } from './data';
import { flag, num, text } from './native-data';
import { heroAbilities, type HeroSetup } from './native-heroes';
import { nativeUnitStats, unitKindForName } from './native-units';

/** Direct active-ability summons, with the same source tier rules as releaseSpawns. */
export function heroSummonLevels(
  heroes: readonly HeroSetup[],
  researchedLevel: (kind: UnitKind) => number = () => 1,
) {
  const levels = new Map<string, number[]>();
  for (const hero of heroes)
    for (const ability of heroAbilities(hero)) {
      if (ability.passive || num(ability.row, 'TroopCount') <= 0) continue;
      const kind = unitKindForName(text(ability.row, 'SpawnedTroop')) as UnitKind | undefined;
      if (!kind) continue;
      const requested = flag(ability.row, 'CopySpawnnedTroopLevelFromAvatar')
        ? researchedLevel(kind)
        : num(ability.row, 'TroopLevel', 1) || 1;
      const level = nativeUnitStats(kind, requested).level;
      const tiers = levels.get(kind) ?? [];
      if (!tiers.includes(level)) tiers.push(level);
      levels.set(
        kind,
        tiers.sort((a, b) => a - b),
      );
    }
  return levels;
}
