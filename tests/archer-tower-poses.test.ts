import { expect, it } from 'vitest';
import {
  archerTowerPoses,
  towerArcherPoses,
  archerTowerSource,
} from '../src/game/archer-tower-art';
it('composes every original building state without substituting missing alternate tiers', () => {
  for (let level = 1; level <= 21; level++) {
    for (const state of ['ready', 'constructing', 'upgrading', 'ruin'] as const)
      expect(archerTowerPoses(level, state, 0).length).toBeGreaterThan(0);
    if (level < 7) expect(() => archerTowerPoses(level, 'ready', 0, true)).toThrow();
    else
      expect(archerTowerPoses(level, 'ready', 0, true)).not.toEqual(
        archerTowerPoses(level, 'ready', 0),
      );
    expect(archerTowerPoses(level, 'upgrading', 0).length).toBeGreaterThan(
      archerTowerPoses(level, 'ready', 0).length,
    );
  }
  expect(() => archerTowerSource(22)).toThrow();
  expect(() => archerTowerPoses(1, 'ready', NaN)).toThrow();
});
it('resolves all rooftop variants and directions while holding finished nonlooping attacks', () => {
  for (let level = 1; level <= 21; level++)
    for (const direction of [1, 2, 3] as const) {
      expect(towerArcherPoses(level, 'idle', direction, 0).length).toBeGreaterThan(0);
      const attack = towerArcherPoses(level, 'attack', direction, 100);
      expect(attack.length).toBeGreaterThan(0);
      expect(towerArcherPoses(level, 'attack', direction, 101)).toEqual(attack);
    }
  expect(() => towerArcherPoses(1, 'idle', 1, -1)).toThrow();
});
