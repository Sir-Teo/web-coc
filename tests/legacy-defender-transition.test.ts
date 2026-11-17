import { expect, it } from 'vitest';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { REPLAY_VERSION } from '../src/game/replay';
import { nativeDirectBattle } from './fixtures/native-direct-attacks';

for (const version of [44, 191, 192, REPLAY_VERSION]) {
  for (const defenders of ['absent', 'empty', 'fallen', 'future'] as const)
    it(`version ${version} clears a stale defender route with ${defenders} defenders`, () => {
      const r = nativeDirectBattle('swordsman', 1, version, 6.9);
      if (defenders === 'empty') r.battle.defenders = [];
      if (defenders === 'fallen' || defenders === 'future') {
        const guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 8, 11.5, 0);
        guard.alerted = true;
        guard.stunnedUntil = 100;
        if (defenders === 'fallen') guard.hp = 0;
        else guard.spawnedAt = 10;
      }
      r.unit.defenderTarget = -999;
      r.unit.target = 999;
      r.unit.path = [{ x: -10, y: -10 }];
      r.unit.pathAt = 10;
      r.step();
      expect(r.unit.defenderTarget).toBeUndefined();
      expect(r.unit.target).toBe(2);
      expect(r.unit.path).not.toContainEqual({ x: -10, y: -10 });
      expect(r.unit.x).toBeGreaterThan(6.9);
    });

  it(`version ${version} engages a newly born defender and resumes buildings after its death`, () => {
    const r = nativeDirectBattle('swordsman', 1, version, 6.9);
    r.step();
    expect(r.unit.target).toBe(2);
    const guard = spawnGarrisonDefender(
      r.battle,
      'golem',
      8,
      1,
      r.unit.x + 0.1,
      r.unit.y,
      r.battle.elapsed + 0.1,
    );
    guard.alerted = true;
    guard.stunnedUntil = 100;
    r.step();
    expect(r.unit.defenderTarget).toBeUndefined();
    r.step();
    expect(r.unit.defenderTarget).toBe(guard.id);
    guard.hp = 0;
    // A committed native swing can resolve its existing cleanup before reacquisition.
    for (let i = 0; i < 40 && r.unit.defenderTarget !== undefined; i++) r.step();
    expect(r.unit.defenderTarget).toBeUndefined();
    expect(r.unit.target).toBe(2);
  });
}
