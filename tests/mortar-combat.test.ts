import { describe, expect, it } from 'vitest';
import { BUILDINGS, buildingHp, defenseDamage, defenseDps } from '../src/game/data';
import { GameModel, makeBuilding, type Unit } from '../src/game/model';

function arena(level = 1) {
  const m = new GameModel();
  m.startBattle(0, true);
  const b = m.battle!;
  const mortar = makeBuilding(9000, 'mortar', 10, 10, level);
  b.buildings = [mortar];
  b.started = true;
  const u: Unit = {
    id: 9001,
    kind: 'giant',
    x: 17,
    y: 11,
    hp: 100000,
    maxHp: 100000,
    springUntil: 100000,
    cooldown: 100000,
    target: mortar.id,
    path: [],
    pathAt: 100000,
    attacking: false,
  };
  b.units = [u];
  return { m, b, mortar, u };
}

describe('Mortar normal mode', () => {
  it('uses the accepted level table and applies shell damage only at impact', () => {
    const hp = [400, 450, 500, 550, 600, 650, 700, 800, 950, 1100];
    const dps = [4, 5, 6, 7, 9, 11, 15, 20, 25, 30];
    for (let level = 1; level <= 10; level++) {
      expect(buildingHp('mortar', level)).toBe(hp[level - 1]);
      expect(defenseDps('mortar', level)).toBe(dps[level - 1]);
      expect(defenseDamage('mortar', level)).toBe(dps[level - 1] * 5);
      const { m, b, u } = arena(level);
      m.step(0.05);
      const shell = b.shells[0];
      expect(shell.damage).toBe(dps[level - 1] * 5);
      expect(shell.radius).toBe(1.5);
      m.step(shell.impact - b.elapsed - 0.001);
      expect(u.hp).toBe(u.maxHp);
      m.step(0.001);
      expect(u.hp).toBe(u.maxHp - shell.damage);
      expect(b.shells).toHaveLength(0);
      m.step(0.01);
      expect(u.hp).toBe(u.maxHp - shell.damage);
    }
  });

  it('acquires ground targets from 4 through 11 tiles, including both boundaries', () => {
    expect(BUILDINGS.mortar).toMatchObject({ range: 11, minRange: 4, rate: 5, splash: 1.5 });
    for (const [distance, fires] of [
      [3.999, false],
      [4, true],
      [11, true],
      [11.001, false],
    ] as const) {
      const { m, b, u } = arena();
      u.x = 11 + distance;
      m.step(0.01);
      expect(b.shells.length).toBe(fires ? 1 : 0);
    }
    const { m, b, u } = arena();
    u.kind = 'balloon';
    m.step(0.01);
    expect(b.shells).toHaveLength(0);
  });

  for (const fps of [20, 30, 60]) {
    it(`fires every five seconds at ${fps} simulation frames per second`, () => {
      const { m, b } = arena();
      const launches = new Set<number>();
      for (let step = 0; step < 30 * fps; step++) {
        m.step(1 / fps);
        for (const shell of b.shells) launches.add(shell.launched);
      }
      const times = [...launches];
      expect(times).toHaveLength(6);
      times.forEach((at, i) =>
        expect(Math.abs(at - times[0] - i * 5)).toBeLessThanOrEqual(1 / fps + 1e-8),
      );
    });
  }

  it('never lands damage scheduled after the raid deadline', () => {
    const { m, b, u } = arena();
    b.elapsed = 179.5;
    m.step(0.05);
    expect(b.shells[0].impact).toBeGreaterThan(180);
    m.step(2);
    expect(b.finished).toBe(true);
    expect(u.hp).toBe(u.maxHp);
    expect(b.shells).toHaveLength(0);
  });
});
