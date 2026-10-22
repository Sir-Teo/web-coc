import { expect, it } from 'vitest';
import { spellTowerRange } from '../src/game/spell-tower-stats';

it.each([
  ['rage', 9],
  ['poison', 9],
  ['invisibility', 4.5],
  ['earthquake', 9],
] as const)('shows the selected home %s activation range', (spellMode, range) => {
  const tower = { level: 4, spellMode, spellTowerWeapon: 'rage' as const };
  expect(spellTowerRange(tower)).toBe(range);
});

it('uses the modern selection when the older weapon field differs in the other direction', () => {
  const tower = { level: 4, spellMode: 'rage' as const, spellTowerWeapon: 'invisibility' as const };
  expect(spellTowerRange(tower)).toBe(9);
});

it.each([
  ['rage', 9],
  ['poison', 9],
  ['invisibility', 4.5],
] as const)(
  'keeps the legacy campaign %s range without a modern selection',
  (spellTowerWeapon, range) => {
    expect(spellTowerRange({ level: 3, spellTowerWeapon })).toBe(range);
  },
);
