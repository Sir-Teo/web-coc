import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Unit } from '../src/game/model';
import {
  initializeGarrison,
  stepGarrisonReleases,
  type GarrisonSetup,
} from '../src/game/garrison-release';
import { validateReplay } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { wizardTowerVillage } from './fixtures/wizard-tower-battle';

const setup: GarrisonSetup = {
  castleId: 6,
  mode: 'guard',
  troops: [
    { kind: 'dragon', level: 7, count: 1 },
    { kind: 'balloon', level: 8, count: 3 },
  ],
};
const target = (flying = false): Unit => ({
  id: 1,
  kind: flying ? 'dragon' : 'giant',
  x: 10,
  y: 18,
  hp: 10000,
  maxHp: 10000,
  cooldown: 0,
  target: null,
  path: [],
  pathAt: 0,
  attacking: false,
});
function model() {
  const save = wizardTowerVillage();
  save.buildings[5] = makeBuilding(6, 'clancastle', 18, 18, 5);
  const m = new GameModel(save);
  m.startBattle(0, true);
  return m;
}
function record() {
  const m = model();
  m.activeTroop = 'giant';
  expect(m.deploy(10, 18)).toBe(true);
  for (let i = 0; i < 100; i++) m.step(0.05);
  m.finishBattle();
  // Authored playback input: the source record supplies valid attacker commands and timing.
  const replay = structuredClone(m.state.raidLog![0].replay!);
  replay.initial.garrisons = [structuredClone(setup)];
  return replay;
}

it('releases a finite roster at exact search times and alternating source exit points', () => {
  const battle = model().battle!;
  battle.garrisons = [initializeGarrison(setup)];
  battle.units = [target()];
  battle.elapsed = 2;
  stepGarrisonReleases(battle);
  expect(battle.defenders!.map((d) => [d.kind, d.spawnedAt, d.x, d.y])).toEqual([
    ['balloon', 0, 20.75, 19.5],
    ['balloon', 0.384, 18.25, 19.5],
    ['balloon', 0.768, 19.5, 20.75],
    ['dragon', 1.152, 19.5, 18.25],
  ]);
  expect(new Set(battle.defenders!.map((d) => d.id)).size).toBe(4);
  stepGarrisonReleases(battle);
  expect(battle.defenders).toHaveLength(4);
  expect(setup.troops.map((t) => t.count)).toEqual([1, 3]);
});

it('keeps Balloons inside during air-only lures and resumes after ground attackers arrive', () => {
  const battle = model().battle!;
  battle.garrisons = [initializeGarrison(setup)];
  battle.units = [target(true)];
  battle.elapsed = 1;
  stepGarrisonReleases(battle);
  expect(battle.defenders!.map((d) => d.kind)).toEqual(['dragon']);
  battle.units = [{ ...target(), spawnedAt: 1.2 }];
  battle.elapsed = 1.6;
  stepGarrisonReleases(battle);
  expect(battle.defenders!.map((d) => [d.kind, d.spawnedAt])).toEqual([
    ['dragon', 0],
    ['balloon', 1.536],
  ]);
});

it('never releases from a destroyed or sleeping Castle', () => {
  for (const sleeping of [false, true]) {
    const battle = model().battle!;
    battle.garrisons = [initializeGarrison({ ...setup, mode: sleeping ? 'sleep' : 'guard' })];
    if (!sleeping) battle.buildings.find((b) => b.id === 6)!.hp = 0;
    battle.units = [target()];
    battle.elapsed = 5;
    stepGarrisonReleases(battle);
    expect(battle.defenders).toBeUndefined();
    expect(battle.garrisons[0].released).toBe(0);
  }
});

it('portably reconstructs garrison combat and backward seeking from the explicit roster', () => {
  const replay = record();
  expect(validateReplay(replay)).toBe(true);
  const parsed = parseReplayFile(JSON.stringify(makeReplayFile(replay)));
  expect(parsed.initial.garrisons).toEqual([setup]);
  const viewer = new GameModel();
  expect(viewer.openReplay(parsed)).toBe(true);
  const seek = (at: number) => {
    viewer.seekReplay(at);
    while (viewer.replay!.seeking) viewer.step(0.05);
  };
  seek(4);
  const state = structuredClone(viewer.battle!);
  expect(state.defenders).toHaveLength(4);
  expect(state.garrisons![0].released).toBe(4);
  seek(0.5);
  expect(viewer.battle!.defenders).toHaveLength(2);
  seek(4);
  expect(viewer.battle).toEqual(state);
  expect(parsed.initial.garrisons).toEqual([setup]);
});

it('rejects old versions, duplicate/missing Castles, unresolved troops and aggregate overflow', () => {
  const replay = record();
  expect(validateReplay({ ...replay, version: 37 })).toBe(false);
  for (const garrisons of [
    null,
    {},
    [{ ...setup, castleId: 1 }],
    [setup, setup],
    [{ ...setup, mode: 'invalid' }],
    [{ ...setup, troops: [null] }],
    [{ ...setup, troops: [{ kind: 'dragon', level: 6, count: 1 }] }],
    [{ ...setup, troops: [{ kind: 'balloon', level: 8, count: -1 }] }],
    [{ ...setup, troops: [{ kind: 'balloon', level: 8, count: 701 }] }],
  ])
    expect(validateReplay({ ...replay, initial: { ...replay.initial, garrisons } })).toBe(false);
  const second = makeBuilding(7, 'clancastle', 2, 2, 1);
  expect(
    validateReplay({
      ...replay,
      initial: {
        ...replay.initial,
        buildings: [...replay.initial.buildings, second],
        garrisons: [6, 7].map((castleId) => ({
          ...setup,
          castleId,
          troops: [{ kind: 'balloon', level: 8, count: 400 }],
        })),
      },
    }),
  ).toBe(false);
});

it('does not export unknown fields attached to imported garrison data', () => {
  const replay = record();
  Object.assign(replay.initial.garrisons![0], { privateMemo: 'omit me' });
  Object.assign(replay.initial.garrisons![0].troops[0], { privateMemo: 'omit me too' });
  expect(JSON.stringify(makeReplayFile(replay))).not.toContain('privateMemo');
});
