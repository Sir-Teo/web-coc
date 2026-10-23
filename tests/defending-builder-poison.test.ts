import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { defaultSpellLevels, emptyArmy, emptySpells } from '../src/game/army';

function poisonArena(inRange: boolean) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 16, 20, 18),
    makeBuilding(2, 'builder', 20, 20, 4),
  ];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), poison: 1 };
  model.state.spellLevels = { ...defaultSpellLevels(), poison: 1 };
  model.state.king = undefined;
  model.startBattle(0, true);
  const battle = model.battle!;
  battle.started = true;
  model.damage(battle.buildings[0], battle.buildings[0].maxHp * 0.8);
  for (let step = 0; step < 100 && !battle.late?.defendingBuilder?.builders[0]?.repairCount; step++)
    model.step(0.05);
  const builder = battle.late!.defendingBuilder!.builders[0];
  const before = builder.repairCount;
  model.activeSpell = 'poison';
  expect(model.castSpell(inRange ? builder.x : 35, inRange ? builder.y : 35)).toBe(true);
  for (let step = 0; step < 120; step++) model.step(0.05);
  return builder.repairCount - before;
}

it('the native Poison cloud slows Defending Builder repair cadence', () => {
  expect(poisonArena(true)).toBeLessThan(poisonArena(false) * 0.85);
});

it('reconstructs the cloud and recovery exactly across seeks and preserves version 58 repairs', async () => {
  const { defendingBuilderPoisonRecording } = await import('./fixtures/defending-builder-poison');
  const { replayBattle, validateReplay, compatibleReplayVersion } =
    await import('../src/game/replay');
  const { makeReplayFile, parseReplayFile } = await import('../src/game/replay-file');
  const { defendingBuilderPoisoned } = await import('../src/game/defending-builder-poison');
  const { data, snapshots, later, recovered } = defendingBuilderPoisonRecording();
  expect(validateReplay(data)).toBe(true);
  expect(replayBattle(data.initial, 59).nativeBuilderPoison).toBe(true);
  expect(replayBattle(data.initial, 58).nativeBuilderPoison).toBeUndefined();
  const viewer = new GameModel();
  expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
  for (const snapshot of [...snapshots].reverse()) {
    viewer.seekReplay(snapshot.at);
    while (viewer.replay!.seeking) viewer.step(0.05);
    expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
  }
  viewer.seekReplay(later);
  while (viewer.replay!.seeking) viewer.step(0.05);
  const slow = viewer.battle!.late!.defendingBuilder!.builders[0];
  expect(defendingBuilderPoisoned(slow, viewer.battle!.elapsed)).toBe(true);
  expect(slow.repairs.every((repair) => repair.amount === 52.5)).toBe(true);
  const count = slow.repairCount;
  viewer.seekReplay(recovered);
  while (viewer.replay!.seeking) viewer.step(0.05);
  expect(
    defendingBuilderPoisoned(
      viewer.battle!.late!.defendingBuilder!.builders[0],
      viewer.battle!.elapsed,
    ),
  ).toBe(false);
  const recoveredBuilder = viewer.battle!.late!.defendingBuilder!.builders[0];
  expect(recoveredBuilder.repairCount).toBeGreaterThan(count);
  const lastRepairs = recoveredBuilder.repairs.slice(-2);
  expect(lastRepairs).toHaveLength(2);
  expect(lastRepairs[1].at - lastRepairs[0].at).toBeCloseTo(0.75, 6);
  expect(compatibleReplayVersion(58)).toBe(true);
  expect(viewer.openReplay({ ...data, version: 58 })).toBe(true);
  viewer.seekReplay(later);
  while (viewer.replay!.seeking) viewer.step(0.05);
  const old = viewer.battle!.late!.defendingBuilder!.builders[0];
  expect(old.poison).toBeUndefined();
  expect(old.repairCount).toBeGreaterThan(count);
});

it('clips slow intervals at step boundaries and excludes time already held by Freeze', async () => {
  const { defendingBuilderPoisonTime } = await import('../src/game/defending-builder-poison');
  const { defendingBuilderPoisonRecording } = await import('./fixtures/defending-builder-poison');
  const { data, poisoned } = defendingBuilderPoisonRecording();
  const model = new GameModel();
  model.openReplay(data);
  model.seekReplay(poisoned);
  while (model.replay!.seeking) model.step(0.05);
  const builder = model.battle!.late!.defendingBuilder!.builders[0];
  builder.poison = { since: 1.025, until: 2.025, speed: -0.26, attack: -0.35 };
  const first = defendingBuilderPoisonTime(builder, 1, 1.05, 0.05);
  expect(first.move).toBeCloseTo(0.025 + 0.025 * 0.74, 9);
  expect(first.repair).toBeCloseTo(0.025 + 0.025 * 0.65, 9);
  const last = defendingBuilderPoisonTime(builder, 2, 2.05, 0.05);
  expect(last.move).toBeCloseTo(first.move, 9);
  expect(last.repair).toBeCloseTo(first.repair, 9);
  builder.freeze = { since: 1, until: 1.04, timeLost: 0 };
  const overlap = defendingBuilderPoisonTime(builder, 1, 1.05, 0.01);
  expect(overlap.move).toBeCloseTo(0.01 * 0.74, 9);
  expect(overlap.repair).toBeCloseTo(0.01 * 0.65, 9);
});

it('uses worker positions and strongest overlapping slows, without reaching hidden or unborn workers', async () => {
  const { poisonDefendingBuilders } = await import('../src/game/defending-builder-poison');
  const { defendingBuilderPoisonRecording } = await import('./fixtures/defending-builder-poison');
  const { data, poisoned } = defendingBuilderPoisonRecording();
  const model = new GameModel();
  model.openReplay(data);
  model.seekReplay(poisoned);
  while (model.replay!.seeking) model.step(0.05);
  const battle = model.battle!;
  const builder = battle.late!.defendingBuilder!.builders[0];
  delete builder.poison;
  const skipped = [
    { ...structuredClone(builder), id: 2, x: builder.x + 5 },
    { ...structuredClone(builder), id: 3, spawnedAt: battle.elapsed + 1 },
    { ...structuredClone(builder), id: 4, hiddenAt: battle.elapsed },
  ];
  battle.late!.defendingBuilder!.builders.push(...skipped);
  const at = battle.elapsed;
  poisonDefendingBuilders(battle, builder.x, builder.y, 4, at, 1, -0.4, -0.6);
  poisonDefendingBuilders(battle, builder.x, builder.y, 4, at + 0.2, 2, -0.26, -0.35);
  expect(builder.poison).toEqual({ since: at, until: at + 2.2, speed: -0.4, attack: -0.6 });
  for (const worker of skipped) expect(worker.poison).toBeUndefined();
  poisonDefendingBuilders(battle, builder.x, builder.y, 4, at + 3, 0.5, -0.26, -0.35);
  expect(builder.poison).toEqual({ since: at + 3, until: at + 3.5, speed: -0.26, attack: -0.35 });
});

it('reduces actual walking distance by the native movement slow', async () => {
  const { stepDefendingBuilders } = await import('../src/game/defending-builder');
  const { defendingBuilderPoisonRecording } = await import('./fixtures/defending-builder-poison');
  const { data, poisoned } = defendingBuilderPoisonRecording();
  const model = new GameModel();
  model.openReplay(data);
  model.seekReplay(poisoned);
  while (model.replay!.seeking) model.step(0.05);
  const slow = model.battle!;
  const builder = slow.late!.defendingBuilder!.builders[0];
  builder.x = 25;
  builder.y = 21;
  builder.path = [{ x: 23, y: 21 }];
  builder.pathAt = 1;
  const normal = structuredClone(slow);
  delete normal.late!.defendingBuilder!.builders[0].poison;
  for (const battle of [slow, normal]) {
    battle.elapsed += 0.05;
    stepDefendingBuilders(battle, 0.05);
  }
  const moved = (battle: typeof slow) => 25 - battle.late!.defendingBuilder!.builders[0].x;
  expect(moved(normal)).toBeGreaterThan(0);
  expect(moved(slow) / moved(normal)).toBeCloseTo(0.74, 8);
});
