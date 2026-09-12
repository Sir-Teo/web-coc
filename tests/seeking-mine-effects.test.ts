import { expect, it } from 'vitest';
import {
  SEEKING_MINE_EFFECTS,
  seekingMineEffectPoses,
  seekingMineSoundCues,
} from '../src/game/seeking-mine-effects';
import { SEEKING_MINE_SHAKE, seekingMineShake } from '../src/game/seeking-mine-shake';
import {
  recordSeekingMineTrail,
  SEEKING_MINE_TRAIL,
  type SeekingMineFlight,
} from '../src/game/seeking-mine-flight';
import { GameModel, makeBuilding, type FX } from '../src/game/model';
const p = { x: 300, y: 400 };
it('retains all explosion emitters, additive containers, source flash and finite lifetimes', () => {
  const sample = (name: string, age: number, reduced = false) =>
    seekingMineEffectPoses(4, name, 1, name, 0, age, p, reduced);
  const explosion = sample('Large AirTrap Explosion', 0.1);
  expect(new Set(explosion.map((p) => p.emitter))).toEqual(
    new Set(SEEKING_MINE_EFFECTS['Large AirTrap Explosion'].map((r) => r.ParticleEmitter)),
  );
  expect(
    explosion.filter((p) => p.poses.some((s) => 'group' in s && s.blend === 8)).length,
  ).toBeGreaterThan(0);
  expect(sample('Bomb Appear', 0.1).some((p) => p.emitter === 'clip:gen_appear_fx')).toBe(true);
  for (const name of [
    'Bomb Appear',
    'Small AirTrap',
    'Large AirTrap Explosion',
    'Generic Placing',
  ]) {
    expect(sample(name, 10)).toEqual([]);
    expect(sample(name, 0.1, true)).toEqual([]);
    expect(sample(name, 0.1)).toEqual(sample(name, 0.1));
  }
  const smoke = sample('Trap broken', 1000000);
  expect(smoke.length).toBeGreaterThan(0);
  expect(smoke.length).toBeLessThanOrEqual(11);
  expect(new Set(smoke.map((p) => p.key)).size).toBe(smoke.length);
});
it('plays the five original samples at their retained source volumes and pitch ranges', () => {
  const samples = new Set<string>();
  for (const [name, rows] of Object.entries(SEEKING_MINE_EFFECTS)) {
    const cues = seekingMineSoundCues(7, name, 3, name, 5);
    const sounds = rows.filter((r) => r.Sound);
    expect(cues).toHaveLength(sounds.length);
    for (const [i, cue] of cues.entries()) {
      samples.add(cue.sample);
      expect(cue.at).toBe(5);
      expect(cue.volume).toBe(Number(sounds[i].Volume) / 100);
      expect(cue.pitch).toBeGreaterThanOrEqual(Number(sounds[i].MinPitch) / 100);
      expect(cue.pitch).toBeLessThanOrEqual(Number(sounds[i].MaxPitch) / 100);
    }
  }
  expect(samples.size).toBe(5);
});
it('samples continuous trail positions across simulation steps and bounds retained history', () => {
  expect(SEEKING_MINE_TRAIL).toEqual({ interval: 0.1225, life: 0.9 });
  const flight: SeekingMineFlight = { trail: [], nextTrail: 0 };
  for (let step = 0; step < 2000; step++) {
    const start = step * 0.05,
      end = (step + 1) * 0.05;
    recordSeekingMineTrail(
      flight,
      0,
      start,
      end,
      end,
      { x: start * 3.5, y: 0 },
      { x: end * 3.5, y: 0 },
      false,
    );
    expect(flight.trail.length).toBeLessThanOrEqual(8);
    for (const point of flight.trail) {
      expect(point.x).toBeCloseTo(point.at * 3.5, 10);
      expect(point.y).toBe(0);
    }
  }
  const before = structuredClone(flight.trail);
  recordSeekingMineTrail(flight, 0, 100, 100.1, 100.1, { x: 350, y: 0 }, { x: 350, y: 0.35 }, true);
  expect(flight.trail.filter((p) => p.at >= 100).every((p) => p.x === 350 && p.y >= 0)).toBe(true);
  expect(flight.trail.filter((p) => p.at < 100)).toEqual(before.filter((p) => 100.1 - p.at < 0.9));
  expect(flight.trail.every((p) => p.at < 100.1)).toBe(true);
});
it('provides the source half-second shake only for actual impacts', () => {
  expect(SEEKING_MINE_SHAKE).toEqual({ strength: 50, duration: 0.5, replay: true });
  const m = new GameModel();
  m.startBattle(0, true);
  const b = m.battle!;
  b.started = true;
  b.elapsed = 2.1;
  b.traps[3] = {
    activatedAt: 1,
    resolved: true,
    targetId: 4,
    x: 5,
    y: 5,
    mine: { trail: [], nextTrail: 0, resolvedAt: 2, hit: true },
  };
  expect(seekingMineShake(b, false)).not.toEqual({ x: 0, y: 0 });
  expect(seekingMineShake(b, false, true)).toEqual(seekingMineShake(b, false));
  expect(seekingMineShake(b, true)).toEqual({ x: 0, y: 0 });
  for (const at of [1.9, 2, 2.5, 8]) {
    b.elapsed = at;
    expect(seekingMineShake(b, false)).toEqual({ x: 0, y: 0 });
  }
  b.elapsed = 2.1;
  b.traps[3].mine!.hit = false;
  expect(seekingMineShake(b, false)).toEqual({ x: 0, y: 0 });
  b.traps[3].mine!.hit = true;
  b.finished = true;
  expect(seekingMineShake(b, false)).toEqual({ x: 0, y: 0 });
});
it('sends accepted home handling at the one-tile mine center', () => {
  const m = new GameModel();
  m.state.obstacles = [];
  m.state.buildings = [
    makeBuilding(1, 'townhall', 20, 20, 8),
    makeBuilding(3, 'seekingairmine', 6, 10),
  ];
  const events: FX[] = [];
  m.onEffect = (fx) => events.push(fx);
  m.move(3);
  m.move(3);
  expect(m.place(20, 20)).toBe(false);
  expect(events).toEqual([{ type: 'seekingairmine-pickup', sourceId: 3, x: 6.5, y: 10.5 }]);
  expect(m.place(10, 10)).toBe(true);
  expect(events[1]).toEqual({ type: 'seekingairmine-place', sourceId: 3, x: 10.5, y: 10.5 });
  m.move(3);
  m.cancel();
  expect(events.slice(-2).map((fx) => fx.type)).toEqual([
    'seekingairmine-pickup',
    'seekingairmine-cancel',
  ]);
});
