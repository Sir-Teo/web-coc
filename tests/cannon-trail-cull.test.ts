import { expect, it } from 'vitest';
import type { CannonShot } from '../src/game/cannon-attack';
import { CANNON_EMITTERS, cannonTrailPoses } from '../src/game/cannon-effects';
import { cannonProjectileRow } from '../src/game/cannon-stats';

const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });

it('samples only trail births that can still be alive', () => {
  const level = [...Array(21).keys()]
    .map((i) => i + 1)
    .find((l) => cannonProjectileRow(l)?.ParticleEmitter)!;
  const name = cannonProjectileRow(level).ParticleEmitter;
  const life = Number(CANNON_EMITTERS[name][0].MaxLife) / 1000;
  const trail = Array.from({ length: 228 }, (_, index) => ({
    index,
    at: 10 + index * 0.01,
    x: 5 + index * 0.02,
    y: 5,
    progress: index / 228,
  }));
  const shot = {
    index: 1,
    sourceId: 3,
    level,
    fromX: 5,
    fromY: 5,
    aimX: 10,
    aimY: 5,
    trail,
  } as unknown as CannonShot;
  const elapsed = 10 + 2.27 + life / 2;
  const poses = cannonTrailPoses(shot, elapsed, iso);
  const alive = trail.filter((b) => elapsed - b.at < life && b.at <= elapsed);
  expect(poses.length).toBeGreaterThan(0);
  expect(poses.length).toBeLessThanOrEqual(alive.length);
  const born = new Set(alive.map((b) => `3:trail:1:${b.index}`));
  expect(poses.every((p) => born.has(p.key))).toBe(true);
  // A long-expired trail builds nothing.
  expect(cannonTrailPoses(shot, 60, iso)).toEqual([]);
});
