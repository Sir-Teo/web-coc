import type { Battle, Unit } from './model';
import { heroAbilities } from './native-heroes';
import { text } from './native-data';

/** A real resurrection restarts passive auras, preserving every other equipment/ability guard. */
export function reviveHeroAuras(battle: Battle, unit: Unit, at: number) {
  if (!battle.nativeHeroAuraRevival) return;
  const hero = battle.nativeHeroes?.find((hero) => hero.unitId === unit.id);
  if (!hero) return;
  let resumed = false;
  for (const ability of heroAbilities(hero)) {
    const aura = ability.passive && text(ability.row, 'AuraSpell');
    if (!aura) continue;
    if (hero.charges) delete hero.charges[`aura:${ability.name}`];
    // Large recorded steps can reach revival before the old aura sees a dead owner.
    // Its missed pulses must not catch up through the knockout or duplicate the new field.
    for (const cast of battle.nativeSpells ?? [])
      if (cast.follow === unit.id && cast.name === aura) cast.ended = true;
    resumed = true;
  }
  if (resumed) hero.auraResume = { unitId: unit.id, at };
}
