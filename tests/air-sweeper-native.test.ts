import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { BUILDINGS, buildingHp, maxLevelFor, upgradeCost, upgradeSeconds } from '../src/game/data';
import { SWEEPER_LEVELS, sweeperStats } from '../src/game/air-control-stats';
import { requiredTownHall } from '../src/game/progression';
import { nativeCampaignIssues } from '../src/game/native-campaign';
import {
  sweeperFacing,
  sweeperPose,
  sweeperPoses,
  sweeperBounds,
} from '../src/game/air-sweeper-poses';
import { sweeperEffectPoses, sweeperSoundCues } from '../src/game/air-sweeper-effects';
import { stepSweepers, recordSweeperDestroyed } from '../src/game/air-sweeper';
import { validateSave } from '../src/game/save';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { airSweeperBattle, airSweeperVillage } from './fixtures/air-sweeper-battle';

it('supports every original level while preserving the TH8 ceiling and remaining campaign gates', () => {
  expect(SWEEPER_LEVELS).toHaveLength(7);
  expect(BUILDINGS.airsweeper.maxLevel).toBe(7);
  expect(maxLevelFor('airsweeper', 8)).toBe(4);
  expect([1, 2, 3, 4, 5, 6, 7].map((l) => buildingHp('airsweeper', l))).toEqual([
    750, 800, 850, 900, 950, 1000, 1050,
  ]);
  expect([4, 5, 6].map((l) => upgradeCost('airsweeper', l))).toEqual([1200000, 1900000, 3400000]);
  expect([4, 5, 6].map((l) => upgradeSeconds('airsweeper', l))).toEqual([86400, 172800, 259200]);
  expect([5, 6, 7].map((l) => requiredTownHall('airsweeper', l))).toEqual([9, 10, 11]);
  expect(nativeCampaignIssues(55)).toEqual([]);
  expect(nativeCampaignIssues(56)).toEqual(['Garrison defenders', 'Clan Castle']);
  for (const level of [4, 5, 6, 7]) {
    const m = new GameModel(airSweeperVillage(level));
    expect(validateSave(m.state)).toBe(true);
    m.state.gold = 30000000;
    m.upgrade(6);
    expect(m.state.buildings[5].upgradeEnd).toBeUndefined();
    expect(m.state.gold).toBe(30000000);
  }
  for (const invalid of [0, 8, 1.5, NaN]) expect(() => sweeperStats(invalid)).toThrow();
});

it('keeps the sector fixed while aiming through the full rotation and source loading labels', () => {
  for (let d = 0; d < 360; d++)
    expect(sweeperFacing(Math.cos((d * Math.PI) / 180), Math.sin((d * Math.PI) / 180))).toBe(d);
  const m = airSweeperBattle(),
    b = m.battle!,
    tower = b.buildings.find((v) => v.id === 6)!;
  b.sweepers = { 6: { targetId: 1, prepare: 0.6, directionX: -1, directionY: 0.5 } };
  tower.cooldown = 0;
  const pose = sweeperPose(tower, b, 0, false);
  expect(pose).toMatchObject({ sector: 180, turret: 153, loading: 224, action: 'load' });
  b.sweepers[6].prepare = 0.3;
  expect(sweeperPose(tower, b, 0.3, false).loading).toBe(269);
  b.sweepers[6].prepare = 0.000001;
  expect(sweeperPose(tower, b, 0.6, false).loading).toBe(314);
  b.airSweepers = {
    6: { fired: 1, shots: [{ index: 1, at: 1, x: 19, y: 19, directionX: -1, directionY: 0 }] },
  };
  for (let frame = 0; frame < 10; frame++)
    expect(sweeperPose(tower, b, 1 + frame / 30, false)).toMatchObject({
      action: 'attack',
      loading: 315 + frame,
      turret: 180,
      sector: 180,
    });
  expect(sweeperPose(tower, b, 1, true)).toMatchObject({ action: 'idle', loading: 0, turret: 153 });
  b.defenseStuns[6] = 2;
  expect(sweeperPose(tower, b, 1, false)).toMatchObject({ action: 'idle', turret: 180 });
  tower.hp = 0;
  expect(sweeperPose(tower, b, 1, false).state).toBe('ruin');
});

it('keeps animation bounds and original geometry for every construction, upgrade and ruin state', () => {
  for (let level = 1; level <= 7; level++)
    for (const state of ['setup', 'constructing', 'upgrading', 'ruin'] as const) {
      const bound = sweeperBounds(level, state);
      expect(bound.every(Number.isFinite)).toBe(true);
      expect(bound[2] - bound[0]).toBeGreaterThan(50);
      expect(bound[3] - bound[1]).toBeGreaterThan(30);
      const poses = sweeperPoses(level, {
        state,
        turret: 359,
        sector: 315,
        loading: 324,
        action: 'attack',
      });
      expect(poses.length).toBeGreaterThan(0);
      expect(poses.every((p) => p.blend === 0)).toBe(true);
    }
});

it('records bounded actual launches independently of target loss, stun and destruction', () => {
  const m = airSweeperBattle(),
    b = m.battle!,
    tower = b.buildings.find((v) => v.id === 6)!;
  // Keep one invulnerable stationary target for the source five-second cycle.
  b.units = b.units.slice(0, 1);
  b.units[0].x = 14;
  b.units[0].y = 19;
  b.units[0].hp = 1e9;
  for (let i = 0; i < 2100; i++) {
    b.elapsed += 0.05;
    stepSweepers(b, 0.05, () => {});
  }
  const history = structuredClone(b.airSweepers![6]);
  expect(history.fired).toBeGreaterThan(16);
  expect(history.shots).toHaveLength(16);
  expect(history.shots.at(-1)!.index).toBe(history.fired);
  expect(history.shots.at(-1)!.at - history.shots.at(-2)!.at).toBeCloseTo(5, 6);
  b.units[0].hp = 0;
  stepSweepers(b, 0.05, () => {});
  expect(b.sweepers![6]).toBeUndefined();
  expect(b.airSweepers![6]).toEqual(history);
  recordSweeperDestroyed(b, tower, b.elapsed);
  recordSweeperDestroyed(b, tower, b.elapsed + 1);
  expect(b.airSweepers![6].destroyedAt).toBe(b.elapsed);
});

it('uses deterministic original particles and sound settings and suppresses particle motion when reduced', () => {
  const at = 10,
    ground = { x: 200, y: 250 };
  const poses = sweeperEffectPoses(
    6,
    'attack',
    1,
    'Wind Machine Attack',
    at,
    at + 0.2,
    ground,
    false,
  );
  expect(poses).toHaveLength(10);
  expect(
    poses.every(
      (p) => p.emitter === 'wind_attack_particle' && p.y < ground.y - 60 && p.depth === 8000,
    ),
  ).toBe(true);
  expect(
    sweeperEffectPoses(6, 'attack', 1, 'Wind Machine Attack', at, at + 0.2, ground, false),
  ).toEqual(poses);
  expect(
    sweeperEffectPoses(6, 'attack', 1, 'Wind Machine Attack', at, at + 0.2, ground, true),
  ).toEqual([]);
  expect(
    sweeperEffectPoses(6, 'attack', 1, 'Wind Machine Attack', at, at + 2, ground, false),
  ).toEqual([]);
  for (const [name, sample, volume, low, high] of [
    ['Wind Machine Attack', 'air_cannon_fire_04', 0.9, 0.95, 1.05],
    ['Wind Machine Pickup', 'air_cannon_pickup_03', 0.7, 0.95, 1.05],
    ['Wind Machine Place', 'air_cannon_place_02', 0.8, 1, 1],
    ['Building Destroyed', 'building_destroyed_01', 0.8, 0.85, 0.95],
  ] as const) {
    const cues = sweeperSoundCues(6, 'test', 1, name, at);
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ sample: `airsweeper-${sample}`, volume, at });
    expect(cues[0].pitch).toBeGreaterThanOrEqual(low);
    expect(cues[0].pitch).toBeLessThanOrEqual(high);
  }
});

it.each([1, 4, 5, 6, 7])(
  'portably replays level %i gusts, history, destruction and backward seeks',
  (level) => {
    const m = airSweeperBattle(level),
      states = new Map<number, unknown>();
    for (let i = 1; i <= 6000 && !m.battle!.finished; i++) {
      m.step(0.05);
      if ([15, 40, 120].includes(i)) states.set(i / 20, structuredClone(m.battle));
    }
    expect(m.battle!.finished).toBe(true);
    expect(m.battle!.airSweepers![6].fired).toBeGreaterThan(0);
    const last = structuredClone(m.battle),
      parsed = parseReplayFile(JSON.stringify(makeReplayFile(m.state.raidLog[0].replay!)));
    expect(parsed.version).toBe(38);
    expect(parsed.initial.buildings.find((v) => v.id === 6)!.level).toBe(level);
    const viewer = new GameModel(),
      home = JSON.stringify(viewer.state);
    expect(viewer.openReplay(parsed)).toBe(true);
    const seek = (at: number) => {
      viewer.seekReplay(at);
      while (viewer.replay!.seeking) viewer.step(0.05);
    };
    for (const at of [6, 0.75, 2, 9999, 0.75]) {
      seek(at);
      const expected = (at === 9999 ? last : states.get(at)) as typeof viewer.battle;
      for (const key of [
        'units',
        'buildings',
        'gusts',
        'sweepers',
        'airSweepers',
        'result',
      ] as const)
        expect(viewer.battle![key]).toEqual(expected![key]);
    }
    viewer.returnHome();
    expect(JSON.stringify(viewer.state)).toBe(home);
  },
);
