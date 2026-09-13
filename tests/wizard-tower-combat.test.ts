import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Unit } from '../src/game/model';
import { defenseDamage } from '../src/game/data';
import { stepProjectiles } from '../src/game/projectiles';
import { wizardTowerProjectileTier } from '../src/game/wizard-tower-stats';
import { REPLAY_VERSION, validateReplay } from '../src/game/replay';
import { validateSave } from '../src/game/save';

function arena(level: number, air = false) {
  const m = new GameModel();
  m.startBattle(0, true);
  const b = m.battle!,
    tower = makeBuilding(9000, 'wizardtower', 10, 10, level);
  b.buildings = [tower, makeBuilding(9002, 'townhall', 30, 30)];
  b.started = true;
  const target: Unit = {
    id: 9001,
    kind: air ? 'balloon' : 'giant',
    x: 17.5,
    y: 11.5,
    hp: 10000,
    maxHp: 10000,
    springUntil: 10000,
    cooldown: 10000,
    target: tower.id,
    path: [],
    pathAt: 10000,
    attacking: false,
  };
  b.units = [target];
  m.step(0.05);
  tower.cooldown = 10000;
  return { m, b, tower, target, shot: b.projectiles![0] };
}

it('launches the correct source projectile and damage for every retained level', () => {
  const tiers = [1, 1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4];
  for (let level = 1; level <= 17; level++) {
    const { b, tower, target, shot } = arena(level);
    const tier = tiers[level - 1];
    expect(wizardTowerProjectileTier(level)).toBe(tier);
    expect(shot).toMatchObject({
      weapon: 'arcane',
      variant: tier,
      targetId: target.id,
      sourceId: tower.id,
      splash: 1,
      damage: defenseDamage('wizardtower', level),
    });
    expect(shot.impact - shot.launched).toBeCloseTo(6 / (tier === 1 ? 5 : 9), 12);
    expect(target.hp).toBe(target.maxHp);
    b.elapsed = shot.impact - 0.001;
    stepProjectiles(
      b,
      () => {},
      () => {},
    );
    expect(target.hp).toBe(target.maxHp);
    b.elapsed = shot.impact;
    stepProjectiles(
      b,
      () => {},
      () => {},
    );
    expect(target.hp).toBeCloseTo(target.maxHp - shot.damage, 10);
    expect(b.projectiles).toHaveLength(0);
  }
  expect(() => wizardTowerProjectileTier(0)).toThrow();
  expect(() => wizardTowerProjectileTier(18)).toThrow();
});

for (const level of [1, 5, 8, 10])
  it.each([false, true])(
    `level ${level} keeps its launch point and splashes only the selected layer (air=%s) after destruction`,
    (air) => {
      const { m, b, tower, target, shot } = arena(level, air);
      const boundary = { ...target, id: 9010, x: shot.x + 1 };
      const outside = { ...boundary, id: 9011, x: shot.x + 1.001 };
      const other = { ...target, id: 9012, kind: air ? ('giant' as const) : ('balloon' as const) };
      const newborn = { ...target, id: 9013, spawnedAt: shot.impact + 0.001 };
      b.units.push(boundary, outside, other, newborn);
      const endpoint = { x: shot.x, y: shot.y };
      target.x += 4;
      m.damage(tower, tower.hp);
      b.elapsed = shot.impact / 2;
      stepProjectiles(
        b,
        () => {},
        () => {},
      );
      expect(shot).toMatchObject(endpoint);
      const impacts: string[] = [];
      b.elapsed = shot.impact;
      stepProjectiles(
        b,
        () => {},
        (fx) => impacts.push(fx.type),
      );
      expect(target.hp).toBe(target.maxHp);
      expect(boundary.hp).toBeCloseTo(boundary.maxHp - shot.damage, 10);
      for (const untouched of [outside, other, newborn]) expect(untouched.hp).toBe(untouched.maxHp);
      b.elapsed += 10;
      stepProjectiles(
        b,
        () => {},
        (fx) => impacts.push(fx.type),
      );
      expect(impacts).toEqual(['impact']);
    },
  );

it('retains v33 results while expiring playback under the corrected projectile rules', () => {
  expect(REPLAY_VERSION).toBe(39);
  const m = new GameModel();
  m.startBattle(0, true);
  m.deploy(1, 1);
  m.step(0.05);
  m.finishBattle();
  m.returnHome();
  const record = m.state.raidLog[0];
  record.replay!.version = 33;
  expect(validateReplay(record.replay)).toBe(true);
  expect(validateSave(m.state)).toBe(true);
  const restored = new GameModel(JSON.parse(JSON.stringify(m.state)));
  expect(restored.state.raidLog[0].result).toEqual(record.result);
  expect(restored.startReplay(record.id)).toBe(false);
  expect(restored.battle).toBeNull();
});
