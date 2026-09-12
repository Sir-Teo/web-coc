import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Unit } from '../src/game/model';
import { type TeslaShot } from '../src/game/tesla-attack';
import { teslaAttackCues, teslaAttackPoses } from '../src/game/tesla-effect-poses';
import { teslaMuzzleY } from '../src/game/tesla-poses';
import { nativeVertices } from '../src/game/native-mesh';

const shot: TeslaShot = {
  index: 1,
  at: 1,
  targetId: 99,
  targetKind: 'dragon',
  targetHero: false,
  x: 10,
  y: 10,
  toAir: true,
};
const from = { x: 100, y: 80 },
  to = { x: 290, y: 150 };
const poses = (level: number, age: number) =>
  teslaAttackPoses(3, level, shot, shot.at + age, from, to, to);

it('records bounded, deterministic Tesla history without changing instant damage or cadence', () => {
  const m = new GameModel();
  m.startBattle(0, true);
  const b = m.battle!;
  const tower = makeBuilding(9000, 'tesla', 10, 10, 6);
  b.buildings = [tower, makeBuilding(9001, 'townhall', 30, 30)];
  b.started = true;
  const target: Unit = {
    id: 10000,
    kind: 'dragon',
    x: 18,
    y: 11,
    hp: 100000,
    maxHp: 100000,
    cooldown: 999,
    target: null,
    path: [],
    pathAt: 0,
    attacking: false,
    springUntil: 999,
  };
  b.units = [target];
  m.step(0.05);
  expect(b.teslas).toBeUndefined();
  target.x = 16;
  m.step(0.05);
  expect(target.hp).toBe(99955);
  expect(b.teslas![9000]).toEqual({
    fired: 1,
    shots: [
      {
        index: 1,
        at: 0.1,
        targetId: 10000,
        targetKind: 'dragon',
        targetHero: false,
        x: 16,
        y: 11,
        toAir: true,
      },
    ],
  });
  expect(b.projectiles ?? []).toHaveLength(0);
  for (let i = 0; i < 200; i++) m.step(0.05);
  const state = b.teslas![9000];
  expect(state.fired).toBe(17);
  expect(state.shots).toHaveLength(16);
  expect(state.shots[0].index).toBe(2);
  expect(target.hp).toBe(100000 - state.fired * 45);
  const before = structuredClone(state);
  target.x = 40;
  for (let i = 0; i < 30; i++) m.step(0.05);
  expect(state).toEqual(before);
  m.damage(tower, 9999);
  expect(state.destroyedAt).toBe(b.elapsed);
  const destroyedAt = state.destroyedAt;
  m.step(0.1);
  m.damage(tower, 9999);
  expect(state.destroyedAt).toBe(destroyedAt);
});

it.each([
  [1, 1, 0],
  [4, 2, 0],
  [6, 3, 0],
  [7, 5, 1],
  [17, 5, 1],
])('uses level %i source arc count %i and coil count %i', (level, arcs, coil) => {
  const active = poses(level, 0.05);
  expect(active.filter((p) => p.role === 'arc')).toHaveLength(arcs);
  expect(active.filter((p) => p.role === 'coil')).toHaveLength(coil);
  // spark_1 has no drawable children in this client. Ten spark_2 particles and
  // two randomly selected Hit/s1/s2 particles are the twelve visible impacts.
  expect(active.filter((p) => p.role === 'hit')).toHaveLength(12);
  const capture = structuredClone(active);
  poses(level, 0.55);
  poses(level, 0.2);
  expect(poses(level, 0.05)).toEqual(capture);
  expect(poses(level, -0.01)).toEqual([]);
  expect(poses(level, 1)).toEqual([]);
});

it('maps each original arc to the target span in any direction and retains source animation', () => {
  for (const end of [{ x: 200, y: 80 }, { x: 0, y: 80 }, { x: 100, y: -50 }, to]) {
    const arcs = teslaAttackPoses(3, 17, shot, 1.1, from, end, end).filter((p) => p.role === 'arc');
    const dx = end.x - from.x,
      dy = end.y - from.y,
      length = Math.hypot(dx, dy);
    for (const arc of arcs) {
      const projected: number[] = [];
      for (const pose of arc.poses) {
        if ('group' in pose) throw Error('Arc should be one native strip');
        const vertices = nativeVertices(pose);
        for (let i = 0; i < vertices.length; i += 4)
          projected.push((vertices[i] * dx + vertices[i + 1] * dy) / length);
      }
      expect(Math.min(...projected)).toBeCloseTo(0, 4);
      expect(Math.max(...projected)).toBeCloseTo(length, 4);
    }
  }
  expect(poses(1, 0.05)[0].poses).not.toEqual(poses(1, 0.1)[0].poses);
  expect(
    teslaAttackPoses(3, 17, shot, 1.1, from, from, from).filter((p) => p.role === 'arc'),
  ).toEqual([]);
});

it('preserves source attack/hit sample choices, gain and pitch bounds across seeks', () => {
  const selected = new Set<string>();
  for (let i = 1; i < 100; i++) {
    const event = { ...shot, index: i };
    const cues = teslaAttackCues(3, 17, event);
    expect(cues).toHaveLength(2);
    expect(teslaAttackCues(3, 17, event)).toEqual(cues);
    const [attack, hit] = cues;
    selected.add(attack.sample);
    expect(attack.at).toBe(shot.at);
    expect(attack.volume).toBe(0.4);
    expect(attack.pitch).toBeGreaterThanOrEqual(attack.sample.endsWith('01') ? 0.9 : 1);
    expect(attack.pitch).toBeLessThanOrEqual(attack.sample.endsWith('01') ? 1.1 : 1.2);
    expect(hit).toMatchObject({ sample: 'tesla-tesla_zap_03', at: shot.at, volume: 0.2 });
    expect(hit.pitch).toBeGreaterThanOrEqual(0.5);
    expect(hit.pitch).toBeLessThanOrEqual(0.7);
  }
  expect(selected).toEqual(new Set(['tesla-tesla_zap_01', 'tesla-tesla_zap_03']));
});

it('registers the muzzle to native emergence frames and holds the raised height', () => {
  for (const level of [1, 6, 7, 17]) {
    expect(teslaMuzzleY(level, 0)).toBe(0);
    expect(teslaMuzzleY(level, 4 / 24)).toBeGreaterThan(teslaMuzzleY(level, 13 / 24));
    expect(teslaMuzzleY(level, 17 / 24)).toBe(teslaMuzzleY(level));
    expect(teslaMuzzleY(level, 0, true)).toBe(teslaMuzzleY(level));
  }
});
