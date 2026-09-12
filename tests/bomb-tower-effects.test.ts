import { expect, it } from 'vitest';
import {
  bombParticleTravel,
  bombTowerEffectPoses,
  bombTowerHitEffect,
  bombTowerSoundCues,
  bombTowerHandlingCues,
  bombTowerTrailPoses,
} from '../src/game/bomb-tower-effects';
import { BOMB_TOWER_SHAKE, bombTowerShake } from '../src/game/bomb-tower-shake';
import { GameModel, makeBuilding } from '../src/game/model';
import type { FX } from '../src/game/model';
const p = { x: 800, y: 400 };

it('preserves normal hit variants, repeated emitters and native effect lifetimes', () => {
  const sample = (level: number) =>
    bombTowerEffectPoses(3, 'hit', 1, bombTowerHitEffect(level), 1, 1.16, p, false);
  const count = (level: number, name: string) =>
    sample(level).filter((v) => v.emitter === name).length;
  expect(count(1, 'BombTowerHit')).toBe(5);
  expect(count(1, 'Explosion_1_small')).toBe(15);
  expect(count(1, 'Grass')).toBe(6);
  expect(count(1, 'Stone')).toBe(0);
  expect(count(3, 'Grass')).toBe(9);
  expect(count(3, 'Stone')).toBe(4);
  expect(count(5, 'Fire_balls')).toBe(5);
  expect(sample(3)).toEqual(sample(3));
  expect(new Set(sample(3).map((v) => v.key)).size).toBe(sample(3).length);
  expect(bombTowerEffectPoses(3, 'hit', 1, bombTowerHitEffect(5), 1, 4, p, false)).toEqual([]);
});
it('retains spawned crater, three blast rows, source layering and quiet reduced-motion markers', () => {
  const sample = (age: number, reduced = false) =>
    bombTowerEffectPoses(3, 'explode', 0, 'Bomb Tower Explode', 1, 1 + age, p, reduced);
  expect(sample(0.1).filter((v) => v.emitter === 'explosion_blast')).toHaveLength(3);
  expect(sample(0.1).filter((v) => v.emitter === 'Explosion_flash')).toHaveLength(1);
  const crater = sample(3);
  expect(crater).toHaveLength(1);
  expect(crater[0]).toMatchObject({ emitter: 'bomb_crater', depth: -870, x: 800, y: 400 });
  expect(sample(100)).toEqual([]);
  const reduced = sample(0.1, true);
  expect(new Set(reduced.map((v) => v.emitter))).toEqual(
    new Set(['bomb_crater', 'Super_ground_bomb_area']),
  );
  expect(reduced.every((v) => v.poses.every((pose) => pose.blend === 0))).toBe(true);
  expect(
    sample(0.1, true).map((v) => [v.x, v.y, v.poses.map((p) => ('matrix' in p ? p.matrix : []))]),
  ).toEqual(
    sample(0.2, true).map((v) => [v.x, v.y, v.poses.map((p) => ('matrix' in p ? p.matrix : []))]),
  );
});
it('uses original throw, hit, collapse, explosion and home sound records', () => {
  const throwCue = bombTowerSoundCues(3, 'throw', 1, 'Bomb Tower Throw Start', 1)[0];
  expect(throwCue).toMatchObject({ at: 1, sample: 'bombtower-bomb_tower_atk_01', volume: 0.7 });
  expect(throwCue.pitch).toBeGreaterThanOrEqual(0.98);
  expect(throwCue.pitch).toBeLessThanOrEqual(1.02);
  for (const [effect, low, high, sample] of [
    ['Bomb Tower Hit', 0.95, 1.05, 'bomb_tower_hit_01'],
    ['Bomb Tower Destroyed2', 0.85, 0.95, 'building_destroyed_01'],
    ['Bomb Tower Explode', 0.6, 0.8, 'mortar_hit_01'],
  ] as const) {
    const cues = bombTowerSoundCues(3, effect, 2, effect, 4);
    for (const cue of cues) {
      expect(cue).toMatchObject({ at: 4, volume: 0.8, sample: `bombtower-${sample}` });
      expect(cue.pitch).toBeGreaterThanOrEqual(low);
      expect(cue.pitch).toBeLessThanOrEqual(high);
    }
    expect(cues).toHaveLength(effect === 'Bomb Tower Explode' ? 2 : 1);
    expect(new Set(cues.map((v) => v.key)).size).toBe(cues.length);
  }
  for (const kind of ['pickup', 'place'] as const)
    expect(bombTowerHandlingCues(3, 1, kind, 8)[0]).toMatchObject({ at: 8, volume: 0.8, pitch: 1 });
});
it('retains deterministic smoke births after projectile landing without unbounded travel', () => {
  const shot = { id: '3:1', index: 1, at: 1, impact: 1.5, fromX: 4, fromY: 4, x: 8, y: 4 };
  const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });
  const sample = (t: number) => bombTowerTrailPoses(3, 2, shot, t, iso);
  expect(sample(0.9)).toEqual([]);
  expect(sample(1.2).length).toBeGreaterThan(0);
  expect(sample(1.6).length).toBeGreaterThan(0);
  expect(sample(2.3)).toEqual([]);
  const pose = sample(1.2);
  sample(1.6);
  expect(sample(1.2)).toEqual(pose);
  expect(bombParticleTravel(100, 0, 0, 1)).toBe(100);
  expect(bombParticleTravel(100, 0, 100, 4)).toBe(50);
  expect(bombParticleTravel(5000, 300, 0, 1)).toBeLessThan(100);
});
it('derives the source one-second explosion shake from resolved fuses and suppresses cancelled/finished/reduced states', () => {
  const m = new GameModel();
  m.startBattle(0, true);
  const b = m.battle!;
  b.started = true;
  b.elapsed = 2.1;
  b.deathBombs = {
    3: { sourceId: 3, x: 4, y: 4, armedAt: 1, impact: 2, damage: 150, resolved: true },
  };
  expect(BOMB_TOWER_SHAKE).toEqual({ strength: 100, duration: 1, replay: true });
  const offset = bombTowerShake(b, false);
  expect(offset).not.toEqual({ x: 0, y: 0 });
  expect(bombTowerShake(b, false, true)).toEqual(offset);
  expect(bombTowerShake(b, true)).toEqual({ x: 0, y: 0 });
  for (const time of [1.9, 2, 3, 100]) {
    b.elapsed = time;
    expect(bombTowerShake(b, false)).toEqual({ x: 0, y: 0 });
  }
  b.elapsed = 2.1;
  b.deathBombs[3].cancelled = true;
  expect(bombTowerShake(b, false)).toEqual({ x: 0, y: 0 });
  delete b.deathBombs[3].cancelled;
  b.finished = true;
  expect(bombTowerShake(b, false)).toEqual({ x: 0, y: 0 });
});
it('emits Bomb Tower handling only for accepted gestures with its 3×3 center', () => {
  const m = new GameModel();
  m.state.obstacles = [];
  m.state.buildings = [
    makeBuilding(1, 'townhall', 20, 20, 8),
    makeBuilding(3, 'bombtower', 6, 10, 2),
  ];
  const events: FX[] = [];
  m.onEffect = (fx) => events.push(fx);
  m.move(3);
  m.move(3);
  expect(m.place(20, 20)).toBe(false);
  expect(events).toEqual([{ type: 'bombtower-pickup', sourceId: 3, x: 7.5, y: 11.5 }]);
  expect(m.place(10, 10)).toBe(true);
  expect(events[1]).toEqual({ type: 'bombtower-place', sourceId: 3, x: 11.5, y: 11.5 });
  m.move(3);
  m.cancel();
  expect(events.slice(-2).map((v) => v.type)).toEqual(['bombtower-pickup', 'bombtower-cancel']);
});
