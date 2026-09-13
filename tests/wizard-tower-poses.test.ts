import { expect, it } from 'vitest';
import { makeBuilding, GameModel } from '../src/game/model';
import { asset, buildingTexture } from '../src/game/data';
import { WIZARD_TOWER_ART } from '../src/game/wizard-tower-art';
import {
  towerWizardFacing,
  towerWizardPose,
  towerWizardPoses,
  wizardTowerBounds,
  wizardTowerPoses,
  wizardProjectilePose,
} from '../src/game/wizard-tower-poses';
import {
  recordWizardTowerShot,
  recordWizardTowerHit,
  recordWizardTowerDestroyed,
} from '../src/game/wizard-tower-attack';
import { wizardTowerBattle } from './fixtures/wizard-tower-battle';
import type { CombatProjectile } from '../src/game/projectiles';

it('uses all seventeen original bodies and rooftop families in all three views and their mirrors', () => {
  const families = new Set<string>();
  for (let level = 1; level <= 17; level++) {
    expect(asset('wizardtower', level)).toBe(
      `/assets/buildings/wizard-tower-native/preview-${level}.png`,
    );
    expect(buildingTexture('wizardtower', level)).toBe(
      level === 1 ? 'wizardtower' : `wizardtower-${level}`,
    );
    const body = wizardTowerPoses(level, 'setup');
    expect(body.length).toBeGreaterThan(0);
    expect(wizardTowerPoses(level, 'constructing')).not.toEqual(body);
    expect(wizardTowerPoses(level, 'upgrading').length).toBeGreaterThan(body.length);
    expect(wizardTowerPoses(level, 'ruin')).not.toEqual(body);
    const bounds = wizardTowerBounds(level);
    expect(bounds.every(Number.isFinite)).toBe(true);
    expect(bounds[1]).toBeLessThan(-100);
    for (const direction of [1, 2, 3]) {
      const pose = { action: 'idle' as const, direction, flip: false, time: 0 };
      const actor = towerWizardPoses(level, pose);
      expect(actor.length).toBeGreaterThan(0);
      expect(towerWizardPoses(level, { ...pose, flip: true })).not.toEqual(actor);
      expect(towerWizardPoses(level, { ...pose, action: 'attack', time: 14 / 24 })).not.toEqual(
        actor,
      );
      if (direction === 3) families.add(JSON.stringify(actor));
    }
  }
  expect(families.size).toBe(11);
  expect(() => wizardTowerPoses(18, 'setup')).toThrow();
  expect(towerWizardFacing(-1, -1).direction).toBe(1);
  expect(towerWizardFacing(1, 1).direction).toBe(3);
  expect(towerWizardFacing(1, -1)).toEqual({ direction: 2, flip: false });
  expect(towerWizardFacing(-1, 1)).toEqual({ direction: 2, flip: true });
  expect(WIZARD_TOWER_ART.width / 360).toBe(WIZARD_TOWER_ART.height / 380);
});

it('aligns action frame fourteen with the actual shot and suppresses attack motion when paused by game state', () => {
  for (const level of [1, 3, 5, 7, 9, 11, 13, 14, 15, 16, 17]) {
    const m = wizardTowerBattle(level);
    m.step(0.05);
    const b = m.battle!,
      tower = b.buildings.find((v) => v.kind === 'wizardtower')!;
    const shot = b.wizardTowers![tower.id].shots[0];
    expect(towerWizardPose(tower, b, shot.at, false)).toMatchObject({
      action: 'attack',
      time: 14 / 24,
    });
    expect(towerWizardPose(tower, b, shot.at, true).action).toBe('idle');
    b.defenseStuns[tower.id] = shot.at + 1;
    expect(towerWizardPose(tower, b, shot.at, false).action).toBe('idle');
    delete b.defenseStuns[tower.id];
    tower.cooldown = 0.3;
    expect(towerWizardPose(tower, b, shot.at + 0.7, false)).toMatchObject({
      action: 'attack',
      time: 14 / 24 - 0.3,
    });
    b.finished = true;
    expect(towerWizardPose(tower, b, shot.at + 0.7, false).action).toBe('idle');
    expect(towerWizardPose(tower, null, 0, false).direction).toBe(3);
  }
});

it('keeps four source projectile variants on a straight fixed path with consistent air/ground impact registration', () => {
  const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });
  for (const [tier, level] of [1, 5, 8, 10].entries())
    for (const toAir of [false, true]) {
      const shot = { fromX: 4, fromY: 4, x: 8, y: 4, launched: 1, impact: 1.5, toAir };
      const start = wizardProjectilePose(level, shot, 1, iso, 46),
        mid = wizardProjectilePose(level, shot, 1.25, iso, 46),
        end = wizardProjectilePose(level, shot, 1.5, iso, 46);
      expect([start.t, mid.t, end.t]).toEqual([0, 0.5, 1]);
      expect(mid.x).toBe((start.x + end.x) / 2);
      expect(mid.y).toBe((start.y + end.y) / 2);
      expect(end.x).toBe(iso(8, 4).x);
      expect(end.y).toBe(iso(8, 4).y - 16 - (toAir ? 46 : 0));
      expect(mid.export).toBe(`fx_chr_WizardAttack_Projectile_Lvl${tier + 1}`);
      expect(mid.poses.length).toBeGreaterThan(0);
      // The source flame's leading axis is +Y. Its rotated axis must point toward impact.
      const axis = { x: -Math.sin(mid.rotation), y: Math.cos(mid.rotation) };
      const dx = end.x - start.x,
        dy = end.y - start.y;
      expect(axis.x * dy - axis.y * dx).toBeCloseTo(0, 10);
      expect(axis.x * dx + axis.y * dy).toBeGreaterThan(0);
    }
});

it('bounds visual shot/hit history and preserves the first collapse time without altering battle randomness', () => {
  const m = new GameModel();
  m.startBattle(0, true);
  const b = m.battle!,
    tower = makeBuilding(7, 'wizardtower', 4, 4);
  const before = JSON.stringify(b);
  for (let i = 0; i < 100; i++) {
    const shot = {
      id: `7:${i}`,
      sourceId: 7,
      x: 7,
      y: 8,
      fromX: 5.5,
      fromY: 5.5,
      launched: i,
      impact: i + 0.5,
      toAir: true,
    } as CombatProjectile;
    recordWizardTowerShot(b, tower, shot);
    recordWizardTowerHit(b, shot);
  }
  recordWizardTowerDestroyed(b, tower, 100);
  recordWizardTowerDestroyed(b, tower, 200);
  expect(b.wizardTowers![7].shots).toHaveLength(16);
  expect(b.wizardTowers![7].hits).toHaveLength(16);
  expect(b.wizardTowers![7].shots[0].at).toBe(84);
  expect(b.wizardTowers![7].destroyedAt).toBe(100);
  expect(JSON.stringify({ ...b, wizardTowers: undefined })).toBe(before);
});
