import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { defaultSpellLevels, emptyArmy, emptySpells } from '../src/game/army';

it('retargets a repairing Builder after an actual native Lightning pulse', () => {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 16, 20, 18),
    makeBuilding(2, 'builder', 20, 20, 4),
    makeBuilding(3, 'goldmine', 20, 22, 4),
  ];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), lightning: 1 };
  model.state.spellLevels = { ...defaultSpellLevels(), lightning: 1 };
  model.state.king = undefined;
  model.startBattle(0, true);
  const battle = model.battle!;
  battle.started = true;
  const hall = battle.buildings[0],
    mine = battle.buildings[2];
  model.damage(hall, hall.maxHp * 0.1);
  for (let step = 0; step < 100 && !battle.late?.defendingBuilder?.builders[0]?.engaged; step++)
    model.step(0.05);
  const builder = battle.late!.defendingBuilder!.builders[0];
  expect(builder.target).toBe(hall.id);
  model.activeSpell = 'lightning';
  expect(model.castSpell(builder.x, builder.y)).toBe(true);
  const cast = battle.nativeSpells!.find((spell) => spell.name === 'Lightning')!;
  expect(cast).toBeDefined();
  while (battle.elapsed < cast.firstHit + 0.2) model.step(0.05);
  expect(mine.hp).toBeLessThan(mine.maxHp);
  expect(mine.hp).toBeGreaterThan(0);
  expect(mine.hp / mine.maxHp).toBeLessThan(hall.hp / hall.maxHp);
  expect(builder.target).toBe(mine.id);
});

it('reconstructs recorded Lightning retargeting across seeks while version 57 keeps its commitment', async () => {
  const { defendingBuilderLightningRecording } =
    await import('./fixtures/defending-builder-lightning');
  const { compatibleReplayVersion, replayBattle, validateReplay } =
    await import('../src/game/replay');
  const { makeReplayFile, parseReplayFile } = await import('../src/game/replay-file');
  const { data, snapshots, after, repaired } = defendingBuilderLightningRecording();
  expect(validateReplay(data)).toBe(true);
  expect(replayBattle(data.initial, 58).nativeBuilderLightning).toBe(true);
  expect(replayBattle(data.initial, 57).nativeBuilderLightning).toBeUndefined();
  const viewer = new GameModel();
  expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
  for (const snapshot of [...snapshots].reverse()) {
    viewer.seekReplay(snapshot.at);
    while (viewer.replay!.seeking) viewer.step(0.05);
    expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
  }
  viewer.seekReplay(after);
  while (viewer.replay!.seeking) viewer.step(0.05);
  const battle = viewer.battle!;
  expect(battle.late!.defendingBuilder!.builders[0].target).toBe(3);
  expect(battle.buildings[2].hp).toBeGreaterThan(0);
  expect(battle.buildings[2].hp / battle.buildings[2].maxHp).toBeLessThan(
    battle.buildings[0].hp / battle.buildings[0].maxHp,
  );
  viewer.seekReplay(repaired);
  while (viewer.replay!.seeking) viewer.step(0.05);
  expect(
    viewer.battle!.late!.defendingBuilder!.builders[0].repairs.some(
      (repair) => repair.targetId === 3,
    ),
  ).toBe(true);
  expect(compatibleReplayVersion(57)).toBe(true);
  expect(viewer.openReplay({ ...data, version: 57 })).toBe(true);
  viewer.seekReplay(repaired);
  while (viewer.replay!.seeking) viewer.step(0.05);
  const old = viewer.battle!.late!.defendingBuilder!.builders[0];
  expect(old.target).toBe(1);
  expect(old.repairs.every((repair) => repair.targetId === 1)).toBe(true);
});

it('resets only workers present at the impact point and preserves their repair recovery', async () => {
  const { defendingBuilderLightning } = await import('../src/game/defending-builder-lightning');
  const { defendingBuilderLightningRecording } =
    await import('./fixtures/defending-builder-lightning');
  const { data, before } = defendingBuilderLightningRecording();
  const model = new GameModel();
  model.openReplay(data);
  model.seekReplay(before);
  while (model.replay!.seeking) model.step(0.05);
  const battle = model.battle!;
  const builder = battle.late!.defendingBuilder!.builders[0];
  const at = battle.elapsed;
  const skipped = [
    { ...structuredClone(builder), id: 2, x: builder.x + 3 },
    { ...structuredClone(builder), id: 3, spawnedAt: at + 0.01 },
    { ...structuredClone(builder), id: 4, hiddenAt: at },
    { ...structuredClone(builder), id: 5, retreating: true },
  ];
  battle.late!.defendingBuilder!.builders.push(...skipped);
  const recovery = builder.recovery;
  // Use the scheduled impact time, even if the enclosing step has already advanced.
  battle.elapsed = at + 0.05;
  defendingBuilderLightning(battle, builder.x, builder.y, 2, at);
  expect([builder.target, builder.repairing, builder.engaged]).toEqual([null, false, undefined]);
  expect(builder.path).toEqual([]);
  expect(builder.recovery).toBe(recovery);
  expect(skipped.map((worker) => worker.target)).toEqual([1, 1, 1, 1]);
});
