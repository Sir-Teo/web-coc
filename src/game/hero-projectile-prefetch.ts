import { heroAbilities, heroUnitKind, petStatsFor, type HeroSetup } from './native-heroes';
import { nativeUnitStats, nativeUnitRow } from './native-units';
import { text } from './native-data';

/** Flight rows a selected or recorded hero can use, including its equipment and assigned pet. */
export function heroProjectileNames(heroes: readonly HeroSetup[], phoenixResurrection = false) {
  const names = new Set<string>();
  for (const hero of heroes) {
    names.add(nativeUnitStats(heroUnitKind(hero.kind), hero.level).projectile);
    for (const ability of heroAbilities(hero)) {
      names.add(text(ability.row, 'Projectile'));
      names.add(text(ability.row, 'ReflectProjectile'));
    }
    if (hero.pet) names.add(petStatsFor(hero.pet).projectile);
    if (phoenixResurrection && hero.pet?.kind === 'phoenix')
      names.add(text(nativeUnitRow('phoenixegg', hero.pet.level), 'AltProjectile'));
  }
  names.delete('');
  return [...names];
}
