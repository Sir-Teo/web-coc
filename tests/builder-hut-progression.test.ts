import { expect, it } from 'vitest';
import { emptyArmy, emptySpells } from '../src/game/army';
import { GameModel, makeBuilding } from '../src/game/model';
import { replayBattle, REPLAY_VERSION, validateReplay } from '../src/game/replay';
import { validateSave } from '../src/game/save';

function village(levels: number[]) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    ...levels.map((level, index) =>
      makeBuilding(
        index + 2,
        'builder',
        18 + (index % 2) * 3,
        20 + Math.floor(index / 2) * 3,
        level,
      ),
    ),
  ];
  model.state.nextId = 20;
  model.state.army = { ...emptyArmy(), giant: 20 };
  model.state.spells = emptySpells();
  model.state.king = undefined;
  return model;
}

it('keeps all eight home hut levels through a save and limits levels 5–8 to version 56 recordings', () => {
  expect(REPLAY_VERSION).toBe(56);
  for (const level of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const model = village([level]);
    const save = JSON.parse(JSON.stringify(model.state));
    expect(validateSave(save)).toBe(true);
    expect(new GameModel(save).state.buildings[1].level).toBe(level);
    model.startBattle(0, true);
    model.step(0.05);
    model.finishBattle();
    const data = model.state.raidLog![0].replay!;
    expect(validateReplay(data)).toBe(true);
    for (const version of [47, 51, 54, 55])
      expect(validateReplay({ ...data, version }), `level ${level}, version ${version}`).toBe(
        level <= 4,
      );
    if (level <= 4) expect(replayBattle(data.initial, 55)).toEqual(replayBattle(data.initial, 56));
  }
});

it('reconstructs new hut fire and high-level repairs across backward replay seeks', () => {
  const model = village([5, 6, 7, 8]);
  model.startBattle(0, true);
  model.activeTroop = 'giant';
  for (let index = 0; index < 20; index++) expect(model.deploy(16, 21)).toBe(true);
  const snapshots = new Map<number, unknown>();
  for (let step = 0; step < 240 && !model.battle!.finished; step++) {
    if ([20, 60, 120, 200].includes(step)) snapshots.set(step, structuredClone(model.battle));
    model.step(0.05);
  }
  const battle = model.battle!;
  expect(Object.values(battle.late!.builderHut!.huts).every((hut) => hut.fired > 0)).toBe(true);
  expect(battle.late!.defendingBuilder!.builders.map((builder) => builder.level)).toEqual([
    4, 5, 6, 7,
  ]);
  expect(
    battle.late!.defendingBuilder!.builders.flatMap((builder) => builder.repairs).length,
  ).toBeGreaterThan(0);
  model.finishBattle();
  const data = model.state.raidLog![0].replay!;
  expect(validateReplay(data)).toBe(true);
  const viewer = new GameModel();
  expect(viewer.openReplay(data)).toBe(true);
  expect(snapshots.size).toBe(4);
  for (const [step, expected] of [...snapshots].reverse()) {
    viewer.seekReplay(step * 0.05);
    while (viewer.replay!.seeking) viewer.step(0.05);
    expect(viewer.battle).toEqual(expected);
  }
});
