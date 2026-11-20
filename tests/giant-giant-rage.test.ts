import { expect, it } from 'vitest';
import { healUnit, hurtUnit, unitDamageScale, unitSpeedBonus } from '../src/game/native-status';
import { heroPuppetBattle } from './fixtures/hero-puppet';

it.each([280, 281])(
  'uses the tier-three damage threshold and one-shot rage in version %i',
  (version) => {
    const r = heroPuppetBattle(
      { kind: 'queen', level: 20, items: [{ slug: 'action-figure', level: 6 }] },
      {},
      undefined,
      version,
    );
    expect(r.model.deployNativeHero('queen', 11.4, 11.5)).toBe(true);
    expect(r.model.activateNativeHeroAbility('queen')).toBe(true);
    const giant = r.battle.units.find(({ kind }) => kind === 'giantgiant')!;
    expect(giant).toMatchObject({ level: 3, hp: 2400 });
    hurtUnit(r.battle, giant, 1599, 2);
    expect(unitDamageScale(giant, 2)).toBe(1);
    expect(unitSpeedBonus(giant, 2)).toBe(0);
    hurtUnit(r.battle, giant, 1, 3);
    expect(unitDamageScale(giant, 3)).toBe(version === 281 ? 1.5 : 1);
    expect(unitSpeedBonus(giant, 3)).toBe(version === 281 ? 1.5 : 0);
    expect(unitDamageScale(giant, 22.99)).toBe(version === 281 ? 1.5 : 1);
    expect(unitDamageScale(giant, 23)).toBe(1);
    healUnit(r.battle, giant, 1600, 24);
    hurtUnit(r.battle, giant, 1600, 25);
    expect(unitDamageScale(giant, 25)).toBe(1);
  },
);
