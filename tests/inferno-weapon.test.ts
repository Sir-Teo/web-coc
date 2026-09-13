import { expect, it } from 'vitest';
import {
  infernoDamageStage,
  infernoDps,
  infernoStats,
  reconcileInfernoLocks,
} from '../src/game/inferno-weapon';

it('uses absolute lock thresholds at 1500 and 5250 milliseconds', () => {
  for (let level = 1; level <= 12; level++) {
    expect(
      [0, 1499, 1500, 5249, 5250, 100000].map((t) => infernoDamageStage('single', t, level)),
    ).toEqual([0, 0, 1, 1, 2, 2]);
    expect(infernoDps('single', 5250, level)).toBe(infernoStats(level).weapon.dps[2]);
    expect(infernoDps('multi', 100000, level)).toBe(infernoStats(level).weapon.dps[0]);
  }
});

it('retains the current single lock when a higher-priority candidate arrives', () => {
  const previous = [{ targetId: 8, acquiredAt: 1 }];
  const retained = reconcileInfernoLocks(previous, [2, 8], 'single', 1, 7);
  expect(retained).toEqual(previous);
  expect(retained[0]).not.toBe(previous[0]);
  expect(infernoDps('single', (7 - retained[0].acquiredAt) * 1000, 1)).toBe(800);
  const replaced = reconcileInfernoLocks(retained, [2], 'single', 1, 7);
  expect(replaced).toEqual([{ targetId: 2, acquiredAt: 7 }]);
  expect(infernoDps('single', (7 - replaced[0].acquiredAt) * 1000, 1)).toBe(30);
  expect(reconcileInfernoLocks(replaced, [], 'single', 1, 8)).toEqual([]);
});

it('keeps multi-target locks unique and fills only vacant capacity', () => {
  const candidates = [1, 1, 2, 3, 4, 5, 6, 7];
  const five = reconcileInfernoLocks([], candidates, 'multi', 7, 0);
  expect(five.map((l) => l.targetId)).toEqual([1, 2, 3, 4, 5]);
  expect(reconcileInfernoLocks([], candidates, 'multi', 8, 0)).toHaveLength(6);
  expect(reconcileInfernoLocks(five, [7, 6, 5, 4, 3, 1], 'multi', 7, 3)).toEqual([
    { targetId: 1, acquiredAt: 0 },
    { targetId: 3, acquiredAt: 0 },
    { targetId: 4, acquiredAt: 0 },
    { targetId: 5, acquiredAt: 0 },
    { targetId: 7, acquiredAt: 3 },
  ]);
});

it('rejects unsupported tiers and invalid clocks instead of silently substituting', () => {
  for (const level of [0, 13, 1.5, NaN]) expect(() => infernoStats(level)).toThrow();
  for (const time of [-1, Infinity, NaN])
    expect(() => infernoDamageStage('single', time, 1)).toThrow();
  expect(() =>
    reconcileInfernoLocks([{ targetId: 1, acquiredAt: 2 }], [1], 'single', 1, 1),
  ).toThrow();
  expect(() => reconcileInfernoLocks([], [NaN], 'multi', 1, 0)).toThrow();
});
