import type { Battle, Unit } from './model';
import type { NativeBattleHero } from './native-heroes';
import type { NativeUnitStats } from './native-units';
import { nativeRow, num, seconds, text, tiles } from './native-data';
import { petRow } from './native-hero-data';

function jellyAbility(level: number) {
  const pet = petRow('jelly', level);
  return nativeRow('abilities', text(pet, 'SpecialAbilities'), num(pet, 'SpecialAbilitiesLevel'));
}

export function updateJellyAttachment(battle: Battle, owner: NativeBattleHero, hero: Unit) {
  if (!battle.nativeJellyAttachment || owner.pet?.kind !== 'jelly') return;
  const pet = battle.units.find((unit) => unit.id === owner.petId);
  if (!pet?.native) return;
  const active =
    hero.hp > 0 &&
    !hero.ejected &&
    !hero.native?.recalled &&
    (owner.jellyBrainwashUntil ?? 0) > battle.elapsed + 1e-9;
  if (active && pet.hp > 0 && !pet.ejected && !pet.native.recalled) {
    if (pet.native.jellyAttachedRange === undefined) {
      pet.native.jellyAttachedRange = tiles(jellyAbility(owner.pet.level), 'AttackRange');
      pet.native.untargetable = true;
    }
    pet.x = hero.x;
    pet.y = hero.y;
  } else if (pet.native.jellyAttachedRange !== undefined) {
    delete pet.native.jellyAttachedRange;
    delete pet.native.untargetable;
    pet.target = null;
    pet.attacking = false;
  }
}

export function stepJellyAttachments(battle: Battle) {
  if (!battle.nativeJellyAttachment) return;
  for (const owner of battle.nativeHeroes ?? []) {
    if (owner.pet?.kind !== 'jelly') continue;
    const hero = battle.units.find((unit) => unit.id === owner.unitId);
    if (hero) updateJellyAttachment(battle, owner, hero);
  }
}

/** The original hero instance receives the master ability on its first deployment. */
export function startJellyBrainwash(battle: Battle, hero: NativeBattleHero) {
  if (hero.pet?.kind !== 'jelly' || hero.jellyBrainwashUntil !== undefined) return;
  const ability = jellyAbility(hero.pet.level);
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
