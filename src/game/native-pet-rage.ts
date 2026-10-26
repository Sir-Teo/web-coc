import type { Battle, Unit } from './model';
import type { NativeBattleHero } from './native-heroes';
import { petRow } from './native-hero-data';
import { nativeRow, num, seconds, text } from './native-data';
import { rageModifiers } from './native-rage';
import { mergeBoost } from './native-boost';
import { unitEffects } from './native-status';

/** Mighty Yak's once-per-raid BoostSelf runs after the Hero's automatic ability can save it. */
export function ragePetAfterHeroDeath(battle: Battle, owner: NativeBattleHero, hero: Unit) {
  if (
    !battle.nativeYakMasterRage ||
    owner.pet?.kind !== 'yak' ||
    owner.petHeroDeathUsed ||
    hero.hp > 0 ||
    hero.ejected ||
    hero.native?.recalled
  )
    return;
  const pet = battle.units.find((u) => u.id === owner.petId);
  if (!pet || pet.hp <= 0 || pet.ejected || pet.native?.recalled) return;
  const source = petRow(owner.pet.kind, owner.pet.level);
  if (text(source, 'HeroDeathAbilityType') !== 'BoostSelf') return;
  const row = nativeRow(
    'spells',
    text(source, 'HeroDeathAbilitySpell'),
    num(source, 'HeroDeathAbilityLevel', 1),
  );
  owner.petHeroDeathUsed = true;
  const effects = unitEffects(pet);
  effects.boost = mergeBoost(
    effects.boost,
    `master-death:${owner.kind}`,
    {
      until: battle.elapsed + seconds(row, 'BoostTimeMS'),
      ...rageModifiers(row, false, false),
    },
    battle.elapsed,
  );
}
