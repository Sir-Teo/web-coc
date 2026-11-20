import type { Battle, Unit } from './model';
import type { NativeBattleHero } from './native-heroes';
import { nativeRow, num, seconds, text } from './native-data';
import { petRow } from './native-hero-data';
import { unitEffects } from './native-status';

const canReceive = (unit?: Unit): unit is Unit =>
  !!unit && unit.hp > 0 && !unit.ejected && !unit.native?.recalled;

/** Spirit Walk renews on the pet's own clock, even after its master falls. */
export function stepSpiritFox(battle: Battle, owner: NativeBattleHero) {
  if (owner.pet?.kind !== 'fox' || owner.petId == null) return;
  const pet = battle.units.find(({ id }) => id === owner.petId);
  if (!canReceive(pet)) return;
  const spawned = pet.spawnedAt ?? battle.elapsed;
  const start = Math.max(spawned, owner.spiritFoxNextAt ?? spawned);
  if (start > battle.elapsed + 1e-9) return;

  const source = petRow('fox', owner.pet.level);
  const ability = nativeRow(
    'abilities',
    text(source, 'SpecialAbilities'),
    num(source, 'SpecialAbilitiesLevel'),
  );
  owner.spiritFoxNextAt = start + seconds(ability, 'ActivationCooldown');
  const conceal = (unit: Unit, duration: number) => {
    const effects = unitEffects(unit);
    effects.invisibleUntil = Math.max(effects.invisibleUntil ?? 0, start + duration);
  };
  conceal(pet, seconds(ability, 'DeactivateAfterTime'));
  const hero = battle.units.find(({ id }) => id === owner.unitId);
  if (canReceive(hero)) {
    const granted = nativeRow(
      'abilities',
      text(ability, 'GivenAbility'),
      num(ability, 'GivenAbilityLevel'),
    );
    conceal(hero, seconds(granted, 'DeactivateAfterTime'));
  }
}
