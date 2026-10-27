import type { Battle, Unit } from './model';
import { heroAbilities, heroOf } from './native-heroes';
import { num } from './native-data';

/** Regeneration resumes with living time, rather than owing heals for the knockout. */
export function resetHeroRegeneration(battle: Battle, unit: Unit, at: number) {
  if (!battle.nativeHeroRegeneration || !unit.native) return;
  const hero = heroOf(battle, unit);
  if (
    hero &&
    heroAbilities(hero).some((ability) => ability.passive && num(ability.row, 'Regeneration') > 0)
  )
    unit.native.regenerationAt = at;
}
