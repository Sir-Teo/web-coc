import { heroAbilities, type HeroSetup } from './native-heroes';
import { num } from './native-data';

export const HOG_ATTACK_KINDS = ['hogrider', 'superhogrider', 'superhog', 'superrider'] as const;
export type HogAttackKind = (typeof HOG_ATTACK_KINDS)[number];
export const hogAttackKind = (kind: string): kind is HogAttackKind =>
  kind === 'hogrider' || kind === 'superhogrider' || kind === 'superhog' || kind === 'superrider';

/** Puppet summons use the item's fixed source troop tier, independently of research. */
export function hogPuppetLevel(heroes: readonly HeroSetup[]) {
  let level = 0;
  for (const hero of heroes) {
    if (hero.kind !== 'champion') continue;
    for (const ability of heroAbilities(hero))
      if (ability.name === 'RCEquipSpawnHogs')
        level = Math.max(level, num(ability.row, 'TroopLevel', 1) || 1);
  }
  return level;
}
