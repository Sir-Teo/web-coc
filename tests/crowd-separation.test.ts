import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { separateUnits } from '../src/game/model';
import { crowdSeparationWitness, separationCrowd } from './fixtures/crowd-separation';

it('retains exact crowd states from before skipping exhausted pairs', () => {
  const hash = createHash('sha256');
  crowdSeparationWitness(separateUnits, (value) => hash.update(value));
  expect(hash.digest('hex')).toBe(
    '7fb70118c0a8ae26c424c69377a0ff9cab3d7462d8c08c3afc96350500ad2e4e',
  );
});

it('lets an exhausted body push a neighbor that still has room to move', () => {
  const units = separationCrowd(3, 0);
  // Two smaller, low-ID bodies spend their allowance on each other before the
  // larger final body is visited. The latter must still be pushed by both.
  units[0].kind = units[1].kind = 'swordsman';
  units[2].kind = 'giant';
  separateUnits(units, [], false, 0.07);
  expect(Math.hypot(units[2].x - 20, units[2].y - 20)).toBeGreaterThan(0.01);
  for (const unit of units)
    expect(Math.hypot(unit.x - 20, unit.y - 20)).toBeLessThanOrEqual(0.07 + 1e-9);
});
