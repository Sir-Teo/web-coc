import type { Battle, Unit } from './model';
import type { NativeUnitStats } from './native-units';
import { nativeRow, num, text, tiles } from './native-data';

/** The once-active transform is retired only after the Hero's automatic ability can rescue it. */
export function sneezySpawner(battle: Battle, unit: Pick<Unit, 'id' | 'kind'>) {
  if (!battle.nativeSneezyController || unit.kind !== 'sneezy') return false;
  const owner = battle.nativeHeroes?.find((hero) => hero.petId === unit.id);
  return !!owner && !owner.sneezyTransformed;
}

export function sneezyCombatStats(
  battle: Battle,
  unit: Pick<Unit, 'id' | 'kind'>,
  base: NativeUnitStats,
): NativeUnitStats {
  if (!sneezySpawner(battle, unit)) return base;
  const ability = nativeRow('abilities', base.ability, base.abilityLevel);
  const dps = num(ability, 'DPS');
  return {
    ...base,
    dps,
    damage: dps * base.rate,
    range: tiles(ability, 'AttackRange'),
    projectile: text(ability, 'Projectile'),
  };
}

export function sneezySummon(battle: Battle, unit: Unit, at = battle.elapsed) {
  if (!battle.nativeSneezyController || unit.kind !== 'sneezy') return undefined;
  const summon = unit.native?.sneezySummon;
  return summon && summon.at <= at + 1e-9 && summon.until > at + 1e-9 ? summon : undefined;
}

/** AirSplitPetNoAttack reuses the same walk/idle/attack2 clips at 120% source model scale. */
export const SNEEZY_SPAWNER_SCALE = 1.2;
