import type { Battle, Unit } from './model';
import type { HeroKind } from './native-hero-data';
export function reviveTargetUnit(battle: Battle, kind: HeroKind) {
  const roster = battle.nativeHeroes?.find((hero) => hero.kind === kind),
    id = roster ? roster.unitId : kind === 'king' ? battle.hero?.unitId : undefined;
  return battle.units.find((unit) => unit.id === id && unit.hero === kind);
}
/** Shared by tile resolution and the direct targeting controls. */
export function revivableHero(battle: Battle, unit: Unit) {
  return (
    !!unit.hero &&
    unit.hp <= 0 &&
    !unit.ejected &&
    !battle.nativeHeroes?.some((hero) => hero.unitId === unit.id && hero.phoenix?.pending)
  );
}
export const pendingHeroRevive = (battle: Battle, unitId: number) =>
  battle.nativeSpells?.some(
    (cast) => cast.name === 'Revive' && !cast.ended && cast.reviveTargetId === unitId,
  ) ?? false;
