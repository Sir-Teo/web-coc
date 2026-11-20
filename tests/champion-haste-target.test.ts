import { expect, it } from 'vitest';
import { makeBuilding } from '../src/game/model';
import { revealTeslas } from '../src/game/hidden-tesla';
import { heroPuppetBattle } from './fixtures/hero-puppet';

it.each([
  [284, false],
  [285, false],
  [285, true],
])('handles Tesla diversion in recording %i with expired Haste = %s', (version, expired) => {
  const r = heroPuppetBattle(
    { kind: 'champion', level: 20, items: [{ slug: 'haste-vial', level: 1 }] },
    {},
    undefined,
    version,
  );
  expect(r.model.deployNativeHero('champion', 11.4, 11.5)).toBe(true);
  r.model.step(0.05);
  const champion = r.battle.units.find(({ hero }) => hero === 'champion')!;
  expect(champion.target).toBe(2);
  const target = r.battle.buildings.find(({ id }) => id === champion.target)!;
  expect(r.model.activateNativeHeroAbility('champion')).toBe(true);
  if (expired) r.battle.elapsed += 8;
  r.battle.buildings.push(makeBuilding(3, 'tesla', 12, 14, 1));
  expect(
    revealTeslas(
      r.battle,
      () => {},
      () => true,
    ),
  ).toBe(true);
  expect(champion.target).toBe(version === 284 || expired ? null : target.id);
  target.hp = 0;
  r.model.step(0.05);
  expect(champion.target).toBe(3);
});
