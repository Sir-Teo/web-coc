import { expect, it, vi } from 'vitest';
import { GameModel } from '../src/game/model';
import { BUILDINGS, buildingHp, maxLevelFor, upgradeCost, upgradeSeconds } from '../src/game/data';
import { CANNON_LEVELS, cannonProjectileRow } from '../src/game/cannon-stats';
import { requiredTownHall } from '../src/game/progression';
import { validateSave } from '../src/game/save';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import {
  cannonBounds,
  cannonFacing,
  cannonPose,
  cannonPoses,
  cannonProjectilePose,
} from '../src/game/cannon-poses';
import { cannonEffectPoses, cannonSoundCues, cannonTrailPoses } from '../src/game/cannon-effects';
import { cannonBattle, cannonVillage } from './fixtures/cannon-battle';
import { highPressureBattle, highPressureVillage } from './fixtures/high-pressure-battle';
import { nativeBuildings, nativeCampaignIssues, nativeUnlocked } from '../src/game/native-campaign';
import type { NativeScenePose } from '../src/game/native-mesh';
const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });

it('retains all source levels and prices while respecting every home Town Hall gate', () => {
  expect(BUILDINGS.cannon.maxLevel).toBe(21);
  expect(Array.from({ length: 8 }, (_, i) => maxLevelFor('cannon', i + 1))).toEqual([
    1, 3, 4, 5, 6, 7, 8, 10,
  ]);
  for (const row of CANNON_LEVELS) {
    expect(buildingHp('cannon', row.level)).toBe(row.hp);
    expect(requiredTownHall('cannon', row.level)).toBe(row.townhall);
    if (row.level > 1) {
      expect(upgradeCost('cannon', row.level - 1)).toBe(row.cost);
      expect(upgradeSeconds('cannon', row.level - 1)).toBe(row.seconds);
    }
    const m = new GameModel(cannonVillage(row.level));
    expect(validateSave(m.state)).toBe(true);
    if (row.level >= 10) {
      m.state.gold = 30000000;
      m.upgrade(6);
      expect(m.state.buildings[5].upgradeEnd).toBeUndefined();
      expect(m.state.gold).toBe(30000000);
    }
  }
});

it('finishes a previously paid TH1 level-two upgrade at its saved deadline', () => {
  const m = new GameModel(cannonVillage(1));
  m.townhall!.level = 1;
  const tower = m.state.buildings[5],
    end = m.clock + 30000;
  tower.upgradeStart = m.clock;
  tower.upgradeEnd = end;
  m.state.gold = 123;
  const saved = JSON.parse(JSON.stringify(m.state));
  expect(validateSave(saved)).toBe(true);
  const restored = new GameModel(saved),
    cannon = restored.state.buildings[5];
  restored.tick(end - 1);
  expect(cannon.level).toBe(1);
  restored.tick(end);
  expect([cannon.level, cannon.hp, cannon.upgradeEnd, restored.state.gold]).toEqual([
    2,
    360,
    undefined,
    123,
  ]);
  restored.upgrade(6);
  expect(cannon.upgradeEnd).toBeUndefined();
});

it('aims at every original direction frame, retains the shot on stun and freezes animated roots for reduced motion', () => {
  for (let frame = 0; frame < 360; frame++) {
    const angle = ((frame - 4.5) * Math.PI) / 180;
    expect(cannonFacing(Math.cos(angle), Math.sin(angle))).toBe(frame);
  }
  const m = cannonBattle(15);
  m.step(0.05);
  const b = m.battle!,
    tower = b.buildings[5],
    target = b.units[0];
  target.x = tower.x + 1.5;
  target.y = tower.y + 7.5;
  b.defenseTargets[tower.id] = target.id;
  expect(cannonPose(tower, b, 2).turret).toBe(95);
  const original = b.cannons![6].shots[0];
  b.defenseStuns[6] = 100;
  expect(cannonPose(tower, b, 2).turret).toBe(
    cannonFacing(original.aimX - original.fromX, original.aimY - original.fromY),
  );
  for (const level of [14, 15]) {
    tower.level = level;
    const a = cannonPose(tower, b, 0),
      later = cannonPose(tower, b, 0.4);
    expect(cannonPoses(level, a)).not.toEqual(cannonPoses(level, later));
    expect(cannonPoses(level, cannonPose(tower, b, 6, true))).toEqual(cannonPoses(level, a));
  }
});

it('keeps every original setup, construction, upgrade and rubble mesh inside the picking bounds', () => {
  for (const level of CANNON_LEVELS.map((r) => r.level))
    for (const state of ['setup', 'constructing', 'upgrading', 'ruin'] as const) {
      const bounds = cannonBounds(level, state);
      const check = (poses: NativeScenePose[]) => {
        for (const p of poses) {
          if ('group' in p) {
            check(p.group);
            continue;
          }
          const [a, c, x, d, e, y] = p.matrix;
          for (let i = 0; i < p.vertices.length; i += 4) {
            const px = a * p.vertices[i] + c * p.vertices[i + 1] + x,
              py = d * p.vertices[i] + e * p.vertices[i + 1] + y;
            expect(px).toBeGreaterThanOrEqual(bounds[0] - 1e-7);
            expect(px).toBeLessThanOrEqual(bounds[2] + 1e-7);
            expect(py).toBeGreaterThanOrEqual(bounds[1] - 1e-7);
            expect(py).toBeLessThanOrEqual(bounds[3] + 1e-7);
          }
        }
      };
      for (const turret of [0, 89, 180, 279, 359])
        for (const time of [0, 0.4, 2.6]) check(cannonPoses(level, { state, turret, time }));
    }
});

it('uses eleven original projectile families and preserves source births after impact without spending combat randomness', () => {
  const random = vi.spyOn(Math, 'random'),
    families = new Set<string>();
  try {
    for (const level of CANNON_LEVELS.map((r) => r.level)) {
      const m = cannonBattle(level);
      random.mockClear();
      m.step(0.05);
      const b = m.battle!,
        tower = b.buildings[5],
        shot = b.cannons![6].shots[0];
      tower.cooldown = 100;
      const row = cannonProjectileRow(level),
        start = cannonProjectilePose(shot, b.elapsed, iso);
      families.add(row.Name);
      expect(start.export).toBe(row.ExportName);
      expect(start.poses.length).toBeGreaterThan(0);
      expect(row.UseRotate).toBe('TRUE');
      for (let i = 0; i < 100 && !b.cannons![6].hits.length; i++) m.step(0.01);
      expect(b.cannons![6].hits).toHaveLength(1);
      const end = cannonProjectilePose(shot, shot.impact, iso);
      expect(end.progress).toBe(1);
      expect([end.x, end.y]).toEqual([iso(shot.x, shot.y).x, iso(shot.x, shot.y).y - 16]);
      const births = JSON.stringify(shot.trail);
      expect(cannonTrailPoses(shot, shot.impact + 0.01, iso).length > 0).toBe(
        !!row.ParticleEmitter,
      );
      expect(cannonTrailPoses(shot, shot.impact + 1, iso)).toEqual([]);
      expect(JSON.stringify(shot.trail)).toBe(births);
      expect(random).not.toHaveBeenCalled();
    }
    expect(families.size).toBe(11);
    expect(random).not.toHaveBeenCalled();
  } finally {
    random.mockRestore();
  }
});

it('retains backward smoke, firing direction, source particle counts and deterministic original sound gains', () => {
  const effect = (age: number, facing = { x: 1, y: 0 }) =>
    cannonEffectPoses(6, 'attack', 1, 'Cannon Attack', 0, age, { x: 0, y: 0 }, false, facing);
  const early = effect(0.3),
    late = effect(0.4),
    opposite = effect(0.3, { x: -1, y: 0 });
  const smoke = early.find((p) => p.emitter === 'Cannon_smoke')!;
  expect(late.find((p) => p.key === smoke.key)!.x).toBeLessThan(smoke.x);
  const flash = early.find((p) => p.emitter === 'Cannon_flash')!;
  expect(opposite.find((p) => p.key === flash.key)!.x).toBeCloseTo(-flash.x, 10);
  const larger = cannonEffectPoses(
    6,
    'attack',
    1,
    'Cannon Attack Larger',
    0,
    0.3,
    { x: 0, y: 0 },
    false,
  );
  expect(larger.filter((p) => p.emitter === 'Cannon_flash3')).toHaveLength(30);
  expect(larger.filter((p) => p.emitter === 'Cannon_smoke3')).toHaveLength(40);
  expect(larger.filter((p) => p.emitter === 'Cannon_fireBalls3')).toHaveLength(0);
  expect(cannonEffectPoses(6, 'attack', 1, 'Cannon Attack', 0, 0.1, { x: 0, y: 0 }, true)).toEqual(
    [],
  );
  const hit = cannonEffectPoses(6, 'hit', 1, 'Generic Hit', 0, 0.1, { x: 0, y: 0 }, true);
  expect(new Set(hit.map((p) => p.emitter))).toEqual(new Set(['DefenceHit']));
  for (const [effect, volume] of [
    ['Cannon Attack', 0.7],
    ['Cannon Attack Large', 0.8],
    ['Basic Turret Pickup', 0.8],
    ['Basic Turret Placing', 0.8],
  ] as const) {
    const cues = cannonSoundCues(6, 'sample', 1, effect, 2);
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ volume, pitch: 1, at: 2 });
    expect(cues).toEqual(cannonSoundCues(6, 'sample', 1, effect, 2));
  }
});

for (const level of [1, 8, 11, 12, 14, 15, 17, 20, 21])
  it(`portably replays and seeks complete level ${level} combat without changing home state`, () => {
    const m = cannonBattle(level),
      samples = new Map<number, string>();
    for (let i = 0; i < 4000 && !m.battle!.finished; i++) {
      if ([1, 6, 11, 39, 70, 100, 200, 500].includes(i)) samples.set(i, JSON.stringify(m.battle));
      m.step(0.05);
    }
    expect(m.battle!.finished).toBe(true);
    const end = structuredClone(m.battle),
      record = parseReplayFile(JSON.stringify(makeReplayFile(m.state.raidLog[0].replay!)));
    expect(record.version).toBe(42);
    m.returnHome();
    const home = JSON.stringify(m.state);
    expect(m.openReplay(record)).toBe(true);
    expect(m.battle!.legacyCannonFlight).toBeUndefined();
    const seek = (at: number) => {
      m.seekReplay(at);
      while (m.replay!.seeking) m.step(0.05);
      return structuredClone(m.battle);
    };
    for (const [step, state] of [...samples].reverse())
      expect(seek(step * 0.05)).toEqual(JSON.parse(state));
    expect(seek(9999)).toEqual(end);
    m.returnHome();
    expect(JSON.stringify(m.state)).toBe(home);
  });

it('opens original High Pressure after its prerequisite and reconstructs all four level-fifteen Cannons', () => {
  expect(nativeCampaignIssues(55)).toEqual([]);
  expect(nativeCampaignIssues(56)).toEqual([]);
  expect(nativeUnlocked(55, [])).toBe(false);
  expect(validateSave(highPressureVillage())).toBe(true);
  const m = highPressureBattle(),
    initial = structuredClone(m.battle!.buildings);
  expect(initial).toEqual(nativeBuildings(55));
  for (let i = 0; i < 6000 && !m.battle!.finished; i++) m.step(0.05);
  expect(m.battle!.finished).toBe(true);
  const cannons = initial.filter((b) => b.kind === 'cannon');
  expect(cannons).toHaveLength(4);
  for (const b of cannons) {
    expect(b).toMatchObject({ level: 15, hp: 1500, maxHp: 1500 });
    expect(m.battle!.cannons![b.id].fired).toBeGreaterThan(0);
  }
  const end = structuredClone(m.battle),
    record = parseReplayFile(JSON.stringify(makeReplayFile(m.state.raidLog[0].replay!)));
  expect(record.initial.buildings).toEqual(initial);
  m.returnHome();
  const home = JSON.stringify(m.state);
  expect(m.openReplay(record)).toBe(true);
  m.seekReplay(9999);
  while (m.replay!.seeking) m.step(0.05);
  expect(m.battle).toEqual(end);
  m.returnHome();
  expect(JSON.stringify(m.state)).toBe(home);
});
