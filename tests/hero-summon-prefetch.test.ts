import { expect, it } from 'vitest';
import { heroSummonLevels } from '../src/game/hero-summon-prefetch';
import type { HeroSetup } from '../src/game/native-heroes';
import { heroPuppetBattle } from './fixtures/hero-puppet';

const cases = [
  ['king', 'barbarian-puppet', 'swordsman', 1, 12],
  ['king', 'barbarian-puppet', 'swordsman', 18, 12],
  ['queen', 'archer-puppet', 'archer', 1, 9],
  ['queen', 'archer-puppet', 'archer', 18, 9],
  ['queen', 'healer-puppet', 'healer', 1, 4],
  ['queen', 'healer-puppet', 'healer', 18, 8],
  ['champion', 'hog-rider-puppet', 'hogrider', 1, 5],
  ['champion', 'hog-rider-puppet', 'hogrider', 18, 12],
  ['warden', 'lavaloon-puppet', 'gwlavaloon', 1, 1],
  ['warden', 'lavaloon-puppet', 'gwlavaloon', 27, 11],
  ['prince', 'henchmen-puppet', 'henchman', 1, 1],
  ['prince', 'henchmen-puppet', 'henchman', 18, 7],
] as const;

it.each(cases)('%s %s %s item %i preloads actual tier %i', (kind, slug, troop, item, level) => {
  const hero: HeroSetup = { kind, level: 1, items: [{ slug, level: item }] };
  const r = heroPuppetBattle(hero, { swordsman: 12, archer: 9, healer: 1, hogrider: 1 });
  const before = JSON.stringify(r.battle);
  const levels = heroSummonLevels(r.battle.nativeHeroes!, (kind) =>
    r.model.troopLevel(kind as never),
  );
  expect([...levels]).toEqual([[troop, [level]]]);
  expect(JSON.stringify(r.battle)).toBe(before);
  expect(r.model.deployNativeHero(kind, 11.4, 11.5)).toBe(true);
  expect(r.model.activateNativeHeroAbility(kind)).toBe(true);
  const bodies = r.battle.units.filter((u) => u.kind === troop);
  expect(bodies.length).toBeGreaterThan(0);
  expect(new Set(bodies.map((u) => u.level))).toEqual(new Set([level]));
});

it('keeps distinct recorded/home fixed tiers and deduplicates repeated setups', () => {
  const heroes: HeroSetup[] = [1, 18, 1].map((level) => ({
    kind: 'queen',
    level: 1,
    items: [{ slug: 'healer-puppet', level }],
  }));
  expect([...heroSummonLevels(heroes)]).toEqual([['healer', [4, 8]]]);
});

it('does not treat passive damage-triggered summons as active Puppets', () => {
  expect([
    ...heroSummonLevels([
      { kind: 'king', level: 1, items: [{ slug: 'snake-bracelet', level: 27 }] },
      { kind: 'queen', level: 1, items: [] },
    ]),
  ]).toEqual([]);
});
