import type { Battle, Unit } from '../game/model';
import type { NativeBattleHero } from '../game/native-heroes';
import { seconds } from '../game/native-data';
import { spellEndTime, spellRow } from '../game/native-spells';

/** The live aura refreshes the shield, so its final pulse sets the deadline until it ends. */
export function eternalTomeRemaining(battle: Battle, hero: NativeBattleHero, unit?: Unit) {
  if (
    hero.kind !== 'warden' ||
    !hero.abilityUsed ||
    !unit ||
    unit.hp <= 0 ||
    unit.ejected ||
    unit.native?.recalled ||
    (unit.native?.effects?.phoenixRevive?.until ?? 0) > battle.elapsed ||
    !hero.items.some(({ slug }) => slug === 'eternal-tome')
  )
    return 0;
  const aura = battle.nativeSpells?.find(
    (cast) => cast.name === 'Eternal Tome Aura' && cast.follow === unit.id && !cast.ended,
  );
  const effects = unit.native?.effects;
  let until = 0;
  if (aura) until = spellEndTime(aura) + seconds(spellRow(aura.name, aura.level), 'ShieldTime');
  else if (effects?.shield?.percent === 1 && !effects.phoenixRevive) until = effects.shield.until;
  return Math.max(0, Math.ceil((until - battle.elapsed - 1e-9) * 10)) / 10;
}
