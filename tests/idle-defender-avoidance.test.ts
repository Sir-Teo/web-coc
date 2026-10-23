import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { defaultSpellLevels, emptyArmy, emptySpells } from '../src/game/army';
import { defendingHero } from '../src/game/defending-heroes';
import { spawnSkeleton } from '../src/game/defenders';
import { distance2D } from '../src/game/distance';

function arena(
  kind: 'hero' | 'skeleton',
  {
    trapLevel = 5,
    legacy = false,
    mode = 'ground',
    offset = 0,
    seconds = 12,
  }: {
    trapLevel?: number;
    legacy?: boolean;
    mode?: 'ground' | 'air';
    offset?: number;
    seconds?: number;
  } = {},
) {
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
  if (legacy) delete battle.nativeIdlePoisonAvoidance;
  const trap = makeBuilding(2, 'skeletontrap', 10, 10, trapLevel);
  trap.skeletonMode = mode;
  const defender =
    kind === 'hero'
      ? defendingHero({ kind: 'king', level: 1, x: 10, y: 10 }, 0)
      : spawnSkeleton(battle, trap, 0, 0);
  battle.defenders = [defender];
  const cloud = { x: defender.x - offset, y: defender.y };
  model.activeSpell = 'poison';
  expect(model.castSpell(cloud.x, cloud.y)).toBe(true);
  const distances: number[] = [];
  for (let i = 0; i < Math.round(seconds / 0.05); i++) {
    model.step(0.05);
    distances.push(distance2D(defender.x - cloud.x, defender.y - cloud.y));
  }
  return { model, battle, defender, cloud, distances };
}

it.each(['hero', 'skeleton'] as const)(
  'an idle %s escapes Poison and stays clear of its cloud',
  (kind) => {
    const { defender, cloud } = arena(kind);
    expect(defender.hp).toBeGreaterThan(0);
    expect(distance2D(defender.x - cloud.x, defender.y - cloud.y)).toBeGreaterThan(4);
  },
);

it('a level-one Skeleton starts fleeing even when its native health cannot survive the crossing', () => {
  const { defender, cloud } = arena('skeleton', { trapLevel: 1 });
  expect(defender.maxHp).toBe(30);
  expect(distance2D(defender.x - cloud.x, defender.y - cloud.y)).toBeGreaterThan(3);
  expect(defender.hp).toBe(0);
});

it('a Hero stays clear until the cloud ends, then returns toward its home', () => {
  const { model, defender, cloud, distances } = arena('hero');
  const firstClear = distances.findIndex((distance) => distance > 4);
  expect(firstClear).toBeGreaterThan(0);
  expect(distances.slice(firstClear).every((distance) => distance > 4)).toBe(true);
  for (let i = 0; i < 220; i++) model.step(0.05);
  expect(distance2D(defender.x - cloud.x, defender.y - cloud.y)).toBeLessThan(1.5);
  expect(defender.avoidingPoison).toBeUndefined();
});

it.each(['hero', 'skeleton'] as const)('keeps version-64 idle %s behavior', (kind) => {
  const { defender, cloud } = arena(kind, { legacy: true });
  expect([defender.x, defender.y]).toEqual([cloud.x, cloud.y]);
  expect(defender.poison!.areas).toBeUndefined();
});

it.each(['hero', 'skeleton'] as const)(
  'reconstructs recorded idle %s avoidance through portable seeks and version 64',
  async (kind) => {
    const { idleDefenderAvoidanceRecording } = await import('./fixtures/idle-defender-avoidance');
    const { replayBattle, validateReplay, compatibleReplayVersion } =
      await import('../src/game/replay');
    const { makeReplayFile, parseReplayFile } = await import('../src/game/replay-file');
    const { data, snapshots, clear, cloud, defenderId } = idleDefenderAvoidanceRecording(kind);
    expect(validateReplay(data)).toBe(true);
    expect(replayBattle(data.initial, 65).nativeIdlePoisonAvoidance).toBe(true);
    expect(replayBattle(data.initial, 64).nativeIdlePoisonAvoidance).toBeUndefined();
    const viewer = new GameModel();
    expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
    for (const snapshot of [...snapshots].reverse()) {
      viewer.seekReplay(snapshot.at);
      while (viewer.replay!.seeking) viewer.step(0.05);
      expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
    }
    viewer.seekReplay(clear);
    while (viewer.replay!.seeking) viewer.step(0.05);
    const current = viewer.battle!.defenders!.find((defender) => defender.id === defenderId)!;
    expect(current.hp).toBeGreaterThan(0);
    expect(distance2D(current.x - cloud.x, current.y - cloud.y)).toBeGreaterThan(4);
    expect(compatibleReplayVersion(64)).toBe(true);
    expect(viewer.openReplay({ ...data, version: 64 })).toBe(true);
    viewer.seekReplay(clear);
    while (viewer.replay!.seeking) viewer.step(0.05);
    const old = viewer.battle!.defenders!.find((defender) => defender.id === defenderId)!;
    expect([old.x, old.y]).toEqual([cloud.x, cloud.y]);
    expect(old.poison!.areas).toBeUndefined();
  },
);

it('an air Skeleton escapes from near the cloud edge at its native health and speed', () => {
  const { defender, cloud } = arena('skeleton', { trapLevel: 1, mode: 'air', offset: 3.5 });
  expect(defender.hp).toBeGreaterThan(0);
  expect(distance2D(defender.x - cloud.x, defender.y - cloud.y)).toBeGreaterThan(4);
});

it.each(['hero', 'skeleton'] as const)(
  'an eligible attacker takes priority over idle %s avoidance',
  (kind) => {
    const { model, battle, defender } = arena(kind, { seconds: 0 });
    model.activeTroop = 'giant';
    expect(model.deploy(5, 5)).toBe(true);
    const attacker = battle.units[0];
    attacker.x = defender.x + 0.2;
    attacker.y = defender.y;
    attacker.hp = attacker.maxHp = 100000;
    for (let i = 0; i < 50; i++) {
      model.step(0.05);
      expect(defender.avoidingPoison).toBeUndefined();
    }
    expect(defender.hp).toBeGreaterThan(0);
    expect(defender.target).toBe(attacker.id);
  },
);

it('Freeze holds an avoiding Hero before he resumes his escape', () => {
  const { model, battle, defender, cloud } = arena('hero', { seconds: 2 });
  expect(defender.avoidingPoison).toBe(true);
  model.activeSpell = 'freeze';
  expect(model.castSpell(defender.x, defender.y)).toBe(true);
  const cast = battle.nativeSpells!.find((spell) => spell.name === 'Freeze')!;
  while (battle.elapsed < cast.firstHit + 0.05) model.step(0.05);
  const point = [defender.x, defender.y];
  for (let i = 0; i < 30; i++) model.step(0.05);
  expect([defender.x, defender.y]).toEqual(point);
  for (let i = 0; i < 100; i++) model.step(0.05);
  expect(distance2D(defender.x - cloud.x, defender.y - cloud.y)).toBeGreaterThan(4);
});
