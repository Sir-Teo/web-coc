import { expect, it } from 'vitest';
import { makeBuilding, GameModel } from '../src/game/model';
import {
  bomberFacing,
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
  expect(bomberFacing(1, -1)).toEqual({ direction: 2, flip: true });
  expect(bomberFacing(-1, 1)).toEqual({ direction: 2, flip: false });
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
  const target = { x: 7, y: 8 } as Parameters<typeof recordBombTowerShot>[2];
  const before = JSON.stringify({ ...battle, elapsed: 0 });
  for (let i = 0; i < 100; i++) {
    battle.elapsed = i;
    recordBombTowerShot(battle, tower, target);
  }
  expect(battle.bombTowers![7].shots).toHaveLength(16);
  expect(battle.bombTowers![7].shots[0].at).toBe(84);
  expect(target).toEqual({ x: 7, y: 8 });
  expect(JSON.stringify({ ...battle, elapsed: 0, bombTowers: undefined })).toBe(before);
});
