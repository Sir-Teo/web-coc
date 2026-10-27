import { heroAbilities, heroUnitKind, petStatsFor, type HeroSetup } from './native-heroes';
import { nativeUnitStats, nativeUnitRow } from './native-units';
import { text } from './native-data';

/** Flight rows a selected or recorded hero can use, including its equipment and assigned pet. */
export interface HeroProjectileOptions {
  phoenixResurrection?: boolean;
  wardenFireball?: boolean;
  giantArrow?: boolean;
  frostFlake?: boolean;
  spikyBall?: boolean;
  seekingShield?: boolean;
}
export function heroProjectileNames(
  heroes: readonly HeroSetup[],
  options: HeroProjectileOptions = {},
) {
  const {
    phoenixResurrection = false,
    wardenFireball = false,
    giantArrow = false,
    frostFlake = false,
    spikyBall = false,
    seekingShield = false,
  } = options;
  const names = new Set<string>();
  for (const hero of heroes) {
    names.add(nativeUnitStats(heroUnitKind(hero.kind), hero.level).projectile);
    for (const ability of heroAbilities(hero)) {
      names.add(text(ability.row, 'Projectile'));
      names.add(text(ability.row, 'ReflectProjectile'));
      if (wardenFireball && ability.name === 'GrandWardenFireball')
        names.add(text(ability.row, 'ProjectileOnActivation'));
      if (giantArrow && ability.name === 'ArcherQueenPierceProjectile')
        names.add(text(ability.row, 'ProjectileOnActivation'));
      if (frostFlake && ability.name === 'FrostBlast')
        names.add(text(ability.row, 'ProjectileOnActivation'));
      if (spikyBall && ability.name === 'FootballBounce')
        names.add(text(ability.row, 'ProjectileOnActivation'));
      if (seekingShield && ability.name === 'RoyalChampionShieldBounce')
        names.add(text(ability.row, 'ProjectileOnActivation'));
    }
    if (hero.pet) names.add(petStatsFor(hero.pet).projectile);
    if (phoenixResurrection && hero.pet?.kind === 'phoenix')
      names.add(text(nativeUnitRow('phoenixegg', hero.pet.level), 'AltProjectile'));
  }
  names.delete('');
  return [...names];
}
