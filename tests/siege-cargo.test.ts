import { expect, it } from 'vitest';
import { emptyArmy, emptySpells } from '../src/game/army';
import { GameModel, makeBuilding } from '../src/game/model';
import { replayBattle, REPLAY_VERSION, validateReplay } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import {
  prepareSiegeCargo,
  SIEGE_CARGO_REPLAY_VERSION,
  type SiegeCargoEntry,
} from '../src/game/siege-cargo';

const troops = [
  { kind: 'balloon', level: 1, count: 1 },
  { kind: 'archer', level: 1, count: 1 },
  { kind: 'swordsman', level: 2, count: 1 },
  { kind: 'giant', level: 1, count: 1 },
  { kind: 'swordsman', level: 1, count: 2 },
] satisfies SiegeCargoEntry[];

const expected = [
  ['swordsman', 1],
  ['swordsman', 1],
  ['swordsman', 2],
  ['archer', 1],
  ['giant', 1],
  ['balloon', 1],
];

function village() {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.king = undefined;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 24, 18, 15),
    makeBuilding(2, 'clancastle', 36, 32, 9),
    makeBuilding(3, 'cannon', 34, 18, 1),
    makeBuilding(4, 'workshop', 30, 32, 7),
  ];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), battledrill: 1, battleblimp: 1 };
  model.state.spells = emptySpells();
  return model;
}

it('uses pinned troop capacity and orders housing, source ID and level ascending', () => {
  const castle = (count: number) => ({
    castleLevel: 9,
    troops: [{ kind: 'swordsman', level: 1, count }],
  });
  expect(prepareSiegeCargo(castle(45))).toEqual(castle(45));
  expect(prepareSiegeCargo(castle(46))).toBeUndefined();
  expect(prepareSiegeCargo({ ...castle(1), castleLevel: 15 })).toBeUndefined();
  expect(
    prepareSiegeCargo({ castleLevel: 9, troops: [{ kind: 'battleblimp', level: 1, count: 1 }] }),
  ).toBeUndefined();
  expect(prepareSiegeCargo({ castleLevel: 9, troops: [troops[0], troops[0]] })).toBeUndefined();
  const ordered = prepareSiegeCargo({ castleLevel: 9, troops })!.troops;
  expect(
    ordered.flatMap(({ kind, level, count }) => Array.from({ length: count }, () => [kind, level])),
  ).toEqual(expected);
});

it('rejects malformed or out-of-scope preparation before changing the village or battle', () => {
  const model = village();
  const before = structuredClone(model.state);
  model.startBattle(0, false, 'valley-v1', undefined, troops);
  model.startBattle(0, true, 'valley-v1', undefined, [{ kind: 'archer', level: 1, count: 46 }]);
  expect(model.battle).toBeNull();
  expect(model.state).toEqual(before);
});

it.each(['manual', 'objective'] as const)(
  'releases exactly once after %s loss and reconstructs both sides of the release',
  (trigger) => {
    const model = village();
    const draft = structuredClone(troops);
    model.startBattle(0, true, 'valley-v1', undefined, draft);
    const battle = model.battle!;
    expect(battle.nativeArcherWindup).toBe(true);
    expect(battle.remaining.archer).toBe(0);
    draft[0].count = 40;
    model.activeTroop = trigger === 'manual' ? 'battledrill' : 'battleblimp';
    expect(model.deploy(13, 20)).toBe(true);
    model.step(0.05);
    const capture = () => ({ at: battle.elapsed, state: JSON.parse(JSON.stringify(battle)) });
    const before = capture();
    expect(battle.units).toHaveLength(1);
    if (trigger === 'manual') {
      model.step(0.05);
      expect(model.endSiege()).toBe(true);
      expect(model.endSiege()).toBe(false);
    }
    for (let i = 0; i < 600 && !battle.siegeCargo?.released; i++) model.step(0.05);
    expect(battle.siegeCargo?.released).toBe(true);
    expect(battle.units[0].hp).toBeLessThanOrEqual(0);
    expect(battle.units.slice(1).map(({ kind, level }) => [kind, level])).toEqual(expected);
    const released = capture();
    for (let i = 0; i < 10; i++) model.step(0.05);
    expect(battle.units.slice(1).map(({ kind, level }) => [kind, level])).toEqual(expected);
    model.finishBattle();
    const replay = model.state.raidLog![0].replay!;
    expect(replay.version).toBe(REPLAY_VERSION);
    expect(validateReplay({ ...replay, version: SIEGE_CARGO_REPLAY_VERSION - 1 })).toBe(false);
    const badCastle = structuredClone(replay);
    badCastle.initial.siegeCargo!.castleLevel = 10;
    expect(validateReplay(badCastle)).toBe(false);
    expect(model.state.army.battledrill).toBe(1);
    expect(model.state.army.battleblimp).toBe(1);
    expect(model.state.army.swordsman).toBe(0);
    const { siegeCargo: _, ...legacy } = replay.initial;
    expect(replayBattle(legacy, 253)).toEqual(replayBattle(legacy));
    expect(replayBattle(replay.initial, 253).siegeCargo).toBeUndefined();
    const viewer = new GameModel();
    expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(replay))))).toBe(true);
    for (const sample of [released, before, released]) {
      viewer.seekReplay(sample.at);
      while (viewer.replay!.seeking) viewer.step(0.05);
      expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(sample.state);
    }
  },
);
