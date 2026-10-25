import { heroAbilities, heroUnitKind, petStatsFor, type HeroSetup } from './native-heroes';
import { nativeUnitStats } from './native-units';
import { text } from './native-data';

/** Flight rows a selected or recorded hero can use, including its equipment and assigned pet. */
export function heroProjectileNames(heroes: readonly HeroSetup[]) {
  const names = new Set<string>();
  for (const hero of heroes) {
    names.add(nativeUnitStats(heroUnitKind(hero.kind), hero.level).projectile);
    for (const ability of heroAbilities(hero)) {
      names.add(text(ability.row, 'Projectile'));
      names.add(text(ability.row, 'ReflectProjectile'));
    }
    if (hero.pet) names.add(petStatsFor(hero.pet).projectile);
  }
  names.delete('');
  return [...names];
}
