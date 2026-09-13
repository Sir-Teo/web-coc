import { expect, it } from 'vitest';
import { makeBuilding, GameModel } from '../src/game/model';
import {
  bomberFacing,
  bomberPose,
  bomberPoses,
  bombTowerBounds,
  bombTowerPoses,
  bombProjectilePose,
  bombTowerDeathPoses,
} from '../src/game/bomb-tower-poses';
import { recordBombTowerShot } from '../src/game/bomb-tower-attack';
import type { CombatProjectile } from '../src/game/projectiles';

it('uses every original body and defender family with distinct construction and rubble poses', () => {
  for (let level = 1; level <= 13; level++) {
    const body = bombTowerPoses(level, 'setup');
    expect(body.length).toBeGreaterThan(0);
    expect(bombTowerPoses(level, 'constructing')).not.toEqual(body);
    expect(bombTowerPoses(level, 'upgrading').length).toBeGreaterThan(body.length);
    expect(bombTowerPoses(level, 'ruin')).not.toEqual(body);
    const bounds = bombTowerBounds(level);
    expect(bounds.every(Number.isFinite)).toBe(true);
    expect(bounds[1]).toBeLessThan(-100);
    const pose = { action: 'idle' as const, direction: 3, flip: false, time: 47 / 24 };
    const actor = bomberPoses(level, pose);
    expect(actor.some((v) => 'group' in v)).toBe(true);
    expect(bomberPoses(level, pose, true).every((v) => v.blend === 0)).toBe(true);
    expect(bomberPoses(level, { ...pose, flip: true })).not.toEqual(actor);
  }
  expect(() => bombTowerPoses(14, 'setup')).toThrow();
  expect(bomberFacing(-1, -1).direction).toBe(1);
  expect(bomberFacing(1, 1).direction).toBe(3);
  expect(bomberFacing(1, -1)).toEqual({ direction: 2, flip: false });
  expect(bomberFacing(-1, 1)).toEqual({ direction: 2, flip: true });
});

it('faces the original views toward all six target sectors and keeps the recorded throw direction', () => {
  const sectors = [
    { dx: -1, dy: -3, direction: 1, flip: false },
    { dx: -3, dy: -1, direction: 1, flip: true },
    { dx: 3, dy: -3, direction: 2, flip: false },
    { dx: -3, dy: 3, direction: 2, flip: true },
    { dx: 3, dy: 1, direction: 3, flip: false },
    { dx: 1, dy: 3, direction: 3, flip: true },
  ];
  for (const level of [1, 3, 9])
    for (const { dx, dy, direction, flip } of sectors) {
      const m = new GameModel();
      m.startBattle(0, true);
      const battle = m.battle!,
        tower = makeBuilding(7, 'bombtower', 18, 18, level);
      battle.buildings = [tower];
      battle.started = true;
      const target = {
        id: 90,
        kind: 'giant' as const,
        x: 19.5 + dx,
        y: 19.5 + dy,
        hp: 5000,
        maxHp: 5000,
        cooldown: 99,
        target: null,
        path: [],
        pathAt: 0,
        attacking: false,
        springUntil: 1000,
      };
      battle.units = [target];
      m.step(0.05);
      expect(battle.bombTowers![7].fired).toBe(1);
      const before = JSON.stringify(battle);
      expect(bomberPose(tower, battle, battle.elapsed, false)).toMatchObject({
        action: 'attack',
        direction,
        flip,
        time: 11 / 24,
      });
      expect(JSON.stringify(battle)).toBe(before);
      // Motion or death of the target must not turn a throw already in progress.
      target.x = 19.5 - dx;
      target.y = 19.5 - dy;
      expect(bomberPose(tower, battle, 0.2, false)).toMatchObject({
        action: 'attack',
        direction,
        flip,
      });
      target.hp = 0;
      expect(bomberPose(tower, battle, 0.2, false)).toMatchObject({
        action: 'attack',
        direction,
        flip,
      });
      target.hp = 5000;
      tower.cooldown = 0.2;
      expect(bomberPose(tower, battle, 1, false)).toMatchObject({
        action: 'attack',
        direction: 4 - direction,
        flip: !flip,
      });
      expect(bomberPose(tower, battle, 1, true).action).toBe('idle');
    }
});

it('retains fixed projectile endpoints, native variant selection and a stationary reduced-motion charge', () => {
  const shot = { fromX: 4, fromY: 4, x: 8, y: 4, launched: 1, impact: 1.5 } as CombatProjectile;
  const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });
  const start = bombProjectilePose(1, shot, 1, iso),
    mid = bombProjectilePose(1, shot, 1.25, iso),
    end = bombProjectilePose(1, shot, 1.5, iso);
  expect([start.t, mid.t, end.t]).toEqual([0, 0.5, 1]);
  expect(mid.y).toBeLessThan((start.y + end.y) / 2);
  expect(end.x).toBe(iso(8, 4).x);
  expect(end.y).toBeCloseTo(iso(8, 4).y);
  expect(bombProjectilePose(3, shot, 1.25, iso).poses).not.toEqual(mid.poses);
  expect(bombTowerDeathPoses(2, 0, true)).toEqual(bombTowerDeathPoses(2, 0.9, true));
  expect(bombTowerDeathPoses(3, 0, true)).not.toEqual(bombTowerDeathPoses(2, 0, true));
  expect(bombTowerDeathPoses(2, 0, false)).not.toEqual(bombTowerDeathPoses(2, 0.5, false));
});

it('bounds derived shot history without mutating targets or combat randomness', () => {
  const m = new GameModel();
  m.startBattle(0, true);
  const battle = m.battle!,
    tower = makeBuilding(7, 'bombtower', 4, 4);
  const target = { x: 7, y: 8 };
  const before = JSON.stringify({ ...battle, elapsed: 0 });
  for (let i = 0; i < 100; i++) {
    battle.elapsed = i;
    recordBombTowerShot(battle, tower, {
      ...target,
      launched: i,
      impact: i + 0.5,
    } as CombatProjectile);
  }
  expect(battle.bombTowers![7].shots).toHaveLength(16);
  expect(battle.bombTowers![7].shots[0].at).toBe(84);
  expect(target).toEqual({ x: 7, y: 8 });
  expect(JSON.stringify({ ...battle, elapsed: 0, bombTowers: undefined })).toBe(before);
});
