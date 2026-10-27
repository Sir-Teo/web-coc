import { expect, it } from 'vitest';
import { heroProjectileNames } from '../src/game/hero-projectile-prefetch';

it('warms the Phoenix Egg resurrection packet only with the versioned controller', () => {
  const heroes = [
    { kind: 'king' as const, level: 1, items: [], pet: { kind: 'phoenix' as const, level: 10 } },
  ];
  expect(heroProjectileNames(heroes)).not.toContain('PhoenixResurrect');
  expect(heroProjectileNames(heroes, { phoenixResurrection: true })).toEqual(
    expect.arrayContaining(['PhoenixProjectile', 'PhoenixResurrect']),
  );
});

it('warms Frozen Arrow and every Monolith Arrow stage alongside the Queen base shot', () => {
  expect(
    new Set(
      heroProjectileNames([
        {
          kind: 'queen',
          level: 1,
          items: [
            { slug: 'frozen-arrow', level: 1 },
            { slug: 'monolith-arrow', level: 1 },
          ],
        },
      ]),
    ),
  ).toEqual(
    new Set([
      'ArcherQueen arrow lvl1',
      'QueenFrostyProjectile',
      'ArcherQueenMonolithProjectile3',
      'ArcherQueenMonolithProjectile2',
      'ArcherQueenMonolithProjectile1',
    ]),
  );
});

it('includes the Revenge Deck reflection row', () => {
  expect(
    heroProjectileNames([
      {
        kind: 'duke',
        level: 1,
        items: [{ slug: 'draconic-counter', level: 1 }],
      },
    ]),
  ).toContain('ddreversalcardprojectile');
});

it('includes an assigned Frosty pet and deduplicates repeated home/recorded setups', () => {
  const hero = {
    kind: 'queen' as const,
    level: 1,
    items: [],
    pet: { kind: 'frosty' as const, level: 1 },
  };
  const names = heroProjectileNames([hero, hero]);
  expect(names).toEqual(['ArcherQueen arrow lvl1', 'Frosty_projectile']);
});
