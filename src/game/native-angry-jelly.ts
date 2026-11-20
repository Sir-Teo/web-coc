import type { Battle } from './model';
import type { NativeBattleHero } from './native-heroes';
import type { NativeUnitStats } from './native-units';
import { nativeRow, num, seconds, text } from './native-data';
import { petRow } from './native-hero-data';

/** The original hero instance receives the master ability on its first deployment. */
export function startJellyBrainwash(battle: Battle, hero: NativeBattleHero) {
  if (hero.pet?.kind !== 'jelly' || hero.jellyBrainwashUntil !== undefined) return;
  const pet = petRow('jelly', hero.pet.level);
  const ability = nativeRow(
    'abilities',
    text(pet, 'SpecialAbilities'),
    num(pet, 'SpecialAbilitiesLevel'),
  );
  const granted = nativeRow(
    'abilities',
    text(ability, 'GivenAbility'),
    num(ability, 'GivenAbilityLevel'),
  );
  hero.jellyBrainwashUntil = battle.elapsed + seconds(granted, 'DeactivateAfterTime');
}

export function jellyHeroStats(battle: Battle, hero: NativeBattleHero, base: NativeUnitStats) {
  return (hero.jellyBrainwashUntil ?? 0) > battle.elapsed + 1e-9
    ? { ...base, preferredClass: 'Defense', preferredBuilding: '', groups: false }
    : base;
}
