import { expect, test } from 'vitest';
import type { Unit } from '../src/game/model';
import { mergeBoost } from '../src/game/native-boost';
import { rageVialRemaining } from '../src/ui/rage-vial-feedback';

test('the King tray follows the Vial deadline even when another boost lasts longer', () => {
  const vial = mergeBoost(undefined, 'ability:BarbarianKingRage', { until: 10, damage: 1.2 }, 0);
  const boost = mergeBoost(vial, 'spell:1', { until: 16, damage: 1.5 }, 2);
  const king = { hero: 'king', hp: 100, native: { effects: { boost } } } as Unit;

  expect(rageVialRemaining({ elapsed: 0 }, undefined)).toBe(0);
  expect(rageVialRemaining({ elapsed: 0 }, king)).toBe(10);
  expect(rageVialRemaining({ elapsed: 9.95 }, king)).toBe(1);
  expect(rageVialRemaining({ elapsed: 10 }, king)).toBe(0);
  expect(rageVialRemaining({ elapsed: 1 }, { ...king, hp: 0 })).toBe(0);
  expect(rageVialRemaining({ elapsed: 1 }, { ...king, spent: true })).toBe(0);
  expect(
    rageVialRemaining({ elapsed: 1 }, { ...king, native: { ...king.native!, recalled: true } }),
  ).toBe(0);
  expect(
    rageVialRemaining(
      { elapsed: 1 },
      { ...king, native: { ...king.native!, effects: { boost: { until: 12, damage: 1.2 } } } },
    ),
  ).toBe(0);
});
