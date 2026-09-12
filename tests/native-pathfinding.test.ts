import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { findPath } from '../src/game/model';
import { nativeBuildings } from '../src/game/native-campaign';
import { isTrap } from '../src/game/data';

it('preserves deterministic routes across dense native layouts and melee/ranged approaches', () => {
  const hash = createHash('sha256');
  for (const stage of [33, 42, 49]) {
    const buildings = nativeBuildings(stage);
    const targets = buildings.filter((b) => b.kind !== 'wall' && !isTrap(b.kind));
    for (const [x, y] of [
      [1, 1],
      [46, 46],
      [1, 23],
      [23, 1],
      [23.8, 23.1],
    ]) {
      for (const target of targets.filter((_, i) => i % 3 === 0)) {
        for (const range of [0.4, 3]) {
          hash.update(JSON.stringify(findPath({ x, y }, target, buildings, range)));
        }
      }
    }
  }
  expect(hash.digest('hex')).toBe(
    '48cb889c36037f31c516c8a54e2e8f60ec366bac3506094e301587dc7aab804d',
  );
}, 15000);
