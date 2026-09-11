import { describe, expect, it } from 'vitest';
import { GameModel, makeBuilding, type Unit } from '../src/game/model';
import { defeatPose } from '../src/game/unit-defeat';

function arena(kind: Unit['kind'] = 'archer') {
  const m = new GameModel();
  m.startBattle(0, true);
  const b = m.battle!;
  b.started = true;
  b.buildings = [makeBuilding(9000, 'townhall', 15, 15)];
  const u: Unit = {
    id: 9001,
    kind,
    x: 5,
    y: 5,
    hp: 0,
    maxHp: 100,
    cooldown: 100,
    target: null,
    path: [],
    pathAt: 0,
    attacking: false,
  };
  b.units = [u];
  return { m, b, u };
}

describe('troop defeat presentation', () => {
  it('stamps ordinary casualties once on the simulation clock', () => {
    const { m, u } = arena();
    m.step(0.05);
    expect(u.defeatedAt).toBe(0.05);
    m.step(0.2);
    expect(u.defeatedAt).toBe(0.05);
  });

  it('stamps ejected troops even though their death damage was already suppressed', () => {
    const { m, u } = arena('wallbreaker');
    u.ejected = u.spent = true;
    m.step(0.05);
    expect(u.defeatedAt).toBe(0.05);
  });

  it('stamps a Wall Breaker detonating against a wall in the same step', () => {
    const { m, b, u } = arena('wallbreaker');
    b.buildings.push(makeBuilding(9002, 'wall', 5, 5));
    u.hp = 100;
    u.cooldown = 0;
    u.x = 4.9;
    u.target = 9002;
    m.step(0.05);
    expect(u.hp).toBe(0);
    expect(u.defeatedAt).toBe(b.elapsed);
  });

  it('does not stamp a living troop', () => {
    const { m, u } = arena();
    u.hp = 100;
    m.step(0.05);
    expect(u.defeatedAt).toBeUndefined();
  });

  it('gives airborne casualties a falling pose and spring victims an upward arc', () => {
    const air = defeatPose(0.275, 'air', 1, false);
    expect(air.y).toBeCloseTo(11.5);
    expect(air.angle).toBe(11);
    const spring = defeatPose(0.325, 'spring', -1, false);
    expect(spring).toMatchObject({ x: -35, y: -135, angle: -180 });
    expect(defeatPose(0.2, 'ground', -1, false)).toMatchObject({ x: 0, y: 0, angle: -35 });
  });

  it('hides completed and reduced-motion defeats without residual movement', () => {
    for (const mode of ['ground', 'air', 'spring'] as const) {
      expect(defeatPose(10, mode, 1, false)).toMatchObject({ visible: false, alpha: 0 });
      expect(defeatPose(0, mode, 1, true)).toMatchObject({ visible: false, alpha: 0 });
      const before = defeatPose(-1, mode, 1, false);
      expect(before).toMatchObject({ visible: true, alpha: 1, x: 0, angle: 0 });
      expect(before.y).toBeCloseTo(0);
    }
  });
});
