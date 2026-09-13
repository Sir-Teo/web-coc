import { expect, it } from 'vitest';
import { castleBounds } from '../src/game/castle-art';

// Independent Python composition of the original source graph, scale 1.2 / y -96.
// Uses scripts/import-native-garrison-art.py poses/points and reference/garrison/art.json.
it('matches independent source bounds for low, campaign and maximum Castle tiers', () => {
  const cases = [
    [1, 'setup', [-86.7, -116.27999954223633, 82.98000183105468, 44.81999816894532]],
    [5, 'setup', [-89.8199981689453, -151.44000091552735, 88.43999633789062, 46.38000183105467]],
    [14, 'setup', [-87.06000366210937, -154.2, 87.06000366210937, 43.38000183105467]],
    [5, 'constructing', [-86.21999816894531, -109.56000022888183, 84.6, 37.98000183105469]],
    [
      5,
      'upgrading',
      [-96.23999633789062, -151.44000091552735, 95.81999816894532, 58.56000366210937],
    ],
    [5, 'ruin', [-86.7, -85.8, 86.88000183105468, 44.039996337890614]],
  ] as const;
  for (const [level, state, expected] of cases)
    castleBounds(level, state).forEach((value, i) => expect(value).toBeCloseTo(expected[i], 6));
  expect(() => castleBounds(15)).toThrow();
});
