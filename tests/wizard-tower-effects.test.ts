import { expect, it } from 'vitest';
import {
  wizardTowerEffectPoses,
  wizardTowerHitEffect,
  wizardTowerAttackEffect,
  wizardTowerSoundCues,
  wizardTowerHandlingCues,
  wizardTowerTrailPoses,
  WIZARD_TOWER_EFFECTS,
} from '../src/game/wizard-tower-effects';
import { GameModel, makeBuilding, type FX } from '../src/game/model';
const p = { x: 800, y: 400 };

it('retains every source effect emitter, distinct projectile-tier impacts, delays and lifetimes', () => {
  const used = new Set<string>();
  for (const [effect, rows] of Object.entries(WIZARD_TOWER_EFFECTS)) {
    const poses = wizardTowerEffectPoses(3, 'test', 1, effect, 1, 1.1, p, false);
    expect(new Set(poses.map((v) => v.key)).size).toBe(poses.length);
    for (const row of rows) {
      if (!row.ParticleEmitter) continue;
      expect(
        poses.some((v) => v.emitter === row.ParticleEmitter),
        `${effect}/${row.ParticleEmitter}`,
      ).toBe(true);
      used.add(row.ParticleEmitter);
    }
    expect(wizardTowerEffectPoses(3, 'test', 1, effect, 1, 0.99, p, false)).toEqual([]);
    expect(wizardTowerEffectPoses(3, 'test', 1, effect, 1, 5, p, false)).toEqual([]);
    expect(wizardTowerEffectPoses(3, 'test', 1, effect, 1, 1.1, p, true)).toEqual([]);
    expect(wizardTowerEffectPoses(3, 'test', 1, effect, 1, 1.1, p, false)).toEqual(poses);
  }
  expect(used.size).toBe(22); // The other four emitters belong to continuous projectile trails.
  for (const [tier, level] of [1, 5, 8, 10].entries()) {
    const suffix = tier === 0 ? '' : `_lvl${tier + 1}`;
    const poses = wizardTowerEffectPoses(
      3,
      'hit',
      1,
      wizardTowerHitEffect(level),
      1,
      1.1,
      p,
      false,
    );
    expect(poses.some((v) => v.emitter === `e_chr_WizardAttack_FireBallImpact${suffix}`)).toBe(
      true,
    );
  }
});

it('samples all four bounded trails at their birth positions, including after impact and after rewinding', () => {
  const shot = {
    id: '3:1',
    index: 1,
    at: 1,
    impact: 1.5,
    fromX: 4,
    fromY: 4,
    x: 8,
    y: 4,
    toAir: true,
  };
  const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });
  for (const level of [1, 5, 8, 10]) {
    const sample = (t: number) => wizardTowerTrailPoses(3, level, shot, t, iso, 46);
    expect(sample(0.9)).toEqual([]);
    const flight = sample(1.2);
    expect(flight.length).toBeGreaterThan(0);
    expect(sample(1.6).length).toBeGreaterThan(0);
    expect(sample(2)).toEqual([]);
    expect(sample(1.2)).toEqual(flight);
    const long = wizardTowerTrailPoses(3, level, { ...shot, impact: 10001 }, 10000, iso, 46);
    expect(long.length).toBeLessThanOrEqual(40);
  }
});

it('uses all three original attack sounds and the original hit, destruction and handling volumes/pitches', () => {
  for (const level of [1, 5, 8, 10]) {
    const cues = wizardTowerSoundCues(3, 'attack', 1, wizardTowerAttackEffect(level), 1);
    expect(cues.map((v) => v.sample)).toEqual([
      'wizardtower-mage_attack_02',
      'wizardtower-mage_attack_02v2',
      'wizardtower-mage_attack_02v3',
    ]);
    expect(cues.map((v) => v.volume)).toEqual([0.5, 0.4, 0.5]);
    expect(cues[0].pitch).toBeGreaterThanOrEqual(0.9);
    expect(cues[0].pitch).toBeLessThanOrEqual(1);
    expect(cues[1].pitch).toBeGreaterThanOrEqual(1);
    expect(cues[1].pitch).toBeLessThanOrEqual(1.1);
    expect(new Set(cues.map((v) => v.key)).size).toBe(3);
    const hit = wizardTowerSoundCues(3, 'hit', 1, wizardTowerHitEffect(level), 2)[0];
    expect(hit).toMatchObject({ sample: 'wizardtower-wizard_hit_01', at: 2, volume: 0.5 });
    expect(hit.pitch).toBeGreaterThanOrEqual(0.8);
    expect(hit.pitch).toBeLessThanOrEqual(1);
  }
  expect(wizardTowerSoundCues(3, 'destroy', 0, 'Building Destroyed', 4)[0]).toMatchObject({
    sample: 'wizardtower-building_destroyed_01',
    at: 4,
    volume: 0.8,
  });
  for (const kind of ['pickup', 'place'] as const)
    expect(wizardTowerHandlingCues(3, 1, kind, 8)[0]).toMatchObject({
      at: 8,
      volume: 0.8,
      pitch: 1,
    });
});

it('emits native handling only for accepted home gestures, including cancellation', () => {
  const m = new GameModel();
  m.state.obstacles = [];
  m.state.buildings = [
    makeBuilding(1, 'townhall', 20, 20, 8),
    makeBuilding(3, 'wizardtower', 6, 10, 6),
  ];
  const events: FX[] = [];
  m.onEffect = (fx) => events.push(fx);
  m.move(3);
  m.move(3);
  expect(m.place(20, 20)).toBe(false);
  expect(events).toEqual([{ type: 'wizardtower-pickup', sourceId: 3, x: 7.5, y: 11.5 }]);
  expect(m.place(10, 10)).toBe(true);
  expect(events[1]).toEqual({ type: 'wizardtower-place', sourceId: 3, x: 11.5, y: 11.5 });
  m.move(3);
  m.cancel();
  expect(events.slice(-2).map((v) => v.type)).toEqual(['wizardtower-pickup', 'wizardtower-cancel']);
});
