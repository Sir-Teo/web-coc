import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { defaultSpellLevels, emptyArmy, emptySpells } from '../src/game/army';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { distance2D } from '../src/game/distance';
import { poisonAvoidanceTarget, recordPoisonArea } from '../src/game/poison-avoidance';

function arena(kind: 'dragon' | 'pekka' = 'dragon') {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), poison: 1, freeze: 1 };
  model.state.spellLevels = { ...defaultSpellLevels(), poison: 1, freeze: 1 };
  model.state.king = undefined;
  model.startBattle(0, true);
  const battle = model.battle!;
  const defender = spawnGarrisonDefender(battle, kind, kind === 'dragon' ? 5 : 8, 1, 10, 10, 0);
  model.activeSpell = 'poison';
  expect(model.castSpell(10, 10)).toBe(true);
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / 0.05); i++) model.step(0.05);
  };
  return { model, battle, defender, run };
}

it.each(['dragon', 'pekka'] as const)(
  'an idle released %s leaves an active native Poison cloud',
  (kind) => {
    const { defender, run } = arena(kind);
    run(10);
    expect(defender.hp).toBeGreaterThan(0);
    expect(distance2D(defender.x - 10, defender.y - 10)).toBeGreaterThan(4);
    expect(defender.avoidingPoison).toBeUndefined();
  },
);

it('keeps version-63 idle garrison behavior', () => {
  const { battle, defender, run } = arena();
  delete battle.nativePoisonAvoidance;
  run(10);
  expect([defender.x, defender.y]).toEqual([10, 10]);
  expect(defender.poison!.areas).toBeUndefined();
});

it('prioritizes a living attacker over poison avoidance', () => {
  const { model, battle, defender } = arena();
  model.activeTroop = 'giant';
  expect(model.deploy(5, 5)).toBe(true);
  const attacker = battle.units[0];
  attacker.x = 10.5;
  attacker.y = 10;
  attacker.hp = attacker.maxHp = 100000;
  for (let i = 0; i < 120; i++) {
    model.step(0.05);
    expect(defender.avoidingPoison).toBeUndefined();
  }
  expect(defender.target).toBe(attacker.id);
  expect(defender.attackCount).toBeGreaterThan(0);
});

it('holds avoidance movement under Freeze and resumes afterwards', () => {
  const { model, battle, defender, run } = arena();
  run(2);
  expect(defender.avoidingPoison).toBe(true);
  model.activeSpell = 'freeze';
  expect(model.castSpell(defender.x, defender.y)).toBe(true);
  const cast = battle.nativeSpells!.find((spell) => spell.name === 'Freeze')!;
  while (battle.elapsed < cast.firstHit + 0.05) model.step(0.05);
  const point = [defender.x, defender.y];
  run(1.5);
  expect([defender.x, defender.y]).toEqual(point);
  run(4);
  expect(distance2D(defender.x - 10, defender.y - 10)).toBeGreaterThan(4);
});

it('chooses an exit outside all overlapping clouds', () => {
  const { battle, defender, run } = arena();
  run(2);
  defender.x = 11.5;
  defender.y = 10;
  defender.poison!.areas = [
    { id: 1, x: 10, y: 10, radius: 4, until: 5 },
    { id: 2, x: 13, y: 10, radius: 4, until: 5 },
  ];
  const point = poisonAvoidanceTarget(battle, defender)!;
  expect(point).toBeDefined();
  for (const area of defender.poison!.areas)
    expect(distance2D(point.x - area.x, point.y - area.y)).toBeGreaterThan(area.radius);
});

it('keeps ground exits on the map and outside standing buildings', () => {
  const { battle, defender, run } = arena('pekka');
  run(2);
  defender.x = defender.y = 0.5;
  defender.poison!.areas = [{ id: 1, x: 0.5, y: 0.5, radius: 4, until: 5 }];
  battle.buildings.push(makeBuilding(2, 'goldmine', 4, 0, 1));
  const point = poisonAvoidanceTarget(battle, defender)!;
  expect(point.x).toBeGreaterThanOrEqual(0.5);
  expect(point.y).toBeGreaterThanOrEqual(0.5);
  expect(point.x >= 4 && point.x < 7 && point.y < 3).toBe(false);
  expect(distance2D(point.x - 0.5, point.y - 0.5)).toBeGreaterThan(4);
});

it('refreshes a cloud and prunes expired areas using the pulse time', () => {
  const { defender, run } = arena();
  run(2);
  defender.poison!.areas = [
    { id: 1, x: 10, y: 10, radius: 4, until: 3 },
    { id: 2, x: 13, y: 10, radius: 4, until: 2.4 },
    { id: 3, x: 15, y: 10, radius: 4, until: 2 },
  ];
  recordPoisonArea(defender, { id: 1, x: 10, y: 10, radius: 4, until: 4 }, 2.2);
  expect(defender.poison!.areas.map((area) => area.id)).toEqual([2, 1]);
  expect(defender.poison!.areas[1].until).toBe(4);
});

it('reconstructs recorded idle avoidance exactly across portable seeks and version 63', async () => {
  const { poisonAvoidanceRecording } = await import('./fixtures/poison-avoidance');
  const { replayBattle, validateReplay, compatibleReplayVersion } =
    await import('../src/game/replay');
  const { makeReplayFile, parseReplayFile } = await import('../src/game/replay-file');
  const { data, snapshots, escaped, cloud, defenderId } = poisonAvoidanceRecording();
  expect(validateReplay(data)).toBe(true);
  expect(replayBattle(data.initial, 64).nativePoisonAvoidance).toBe(true);
  expect(replayBattle(data.initial, 63).nativePoisonAvoidance).toBeUndefined();
  const viewer = new GameModel();
  expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
  for (const snapshot of [...snapshots].reverse()) {
    viewer.seekReplay(snapshot.at);
    while (viewer.replay!.seeking) viewer.step(0.05);
    expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
  }
  expect(compatibleReplayVersion(63)).toBe(true);
  expect(viewer.openReplay({ ...data, version: 63 })).toBe(true);
  viewer.seekReplay(escaped);
  while (viewer.replay!.seeking) viewer.step(0.05);
  const old = viewer.battle!.defenders!.find((defender) => defender.id === defenderId)!;
  expect([old.x, old.y]).toEqual([cloud.x, cloud.y]);
  expect(old.poison!.areas).toBeUndefined();
});
