import { expect, it } from 'vitest';
import { GameModel, type Battle } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { giantConstructArena, giantConstructRecording } from './fixtures/giant-arrow-construct';

const towerCasts = (battle: Battle) =>
  battle.nativeSpells?.filter((cast) => cast.name === 'Spell Tower Invisibility') ?? [];

it('a live Giant Arrow sustains the native Invisibility Tower trigger after its Queen is recalled', () => {
  const r = giantConstructArena();
  const { shot, recallAt, expires } = r.launch();
  r.until(0.6);
  const trigger = r.battle.nativeDefenses![r.towerId].trigger!;
  expect(trigger.constructs).toEqual([{ key: shot.id, until: expires }]);
  expect(shot.hit.filter((hit) => [2, 5].includes(hit.target.id))).toHaveLength(2);
  r.until(recallAt + 0.05);
  expect(r.battle.units.some((unit) => unit.id === r.queenId)).toBe(false);
  r.until(1.65);
  const released = r.battle.nativeDefenses![r.towerId].firedAt!;
  expect(released).toBeGreaterThan(recallAt);
  expect(released).toBeLessThan(expires);
  expect(
    r.battle.projectiles?.some(
      (p) => p.sourceId === r.towerId && p.defense?.spell?.name === 'Spell Tower Invisibility',
    ),
  ).toBe(true);
  expect(r.battle.nativeDefenses![r.towerId].trigger).toBeUndefined();
  expect(r.battle.units).toEqual([]);
  r.until(3.25);
  expect(towerCasts(r.battle)).toHaveLength(1);
});

it('an expired horizontal arrow cannot sustain a tower after its Queen leaves', () => {
  const r = giantConstructArena(false);
  const { shot, expires } = r.launch();
  r.until(0.6);
  expect(r.battle.nativeDefenses![r.towerId].trigger!.constructs).toEqual([
    { key: shot.id, until: expires },
  ]);
  r.until(2);
  expect(towerCasts(r.battle)).toEqual([]);
  expect(r.battle.nativeDefenses![r.towerId].trigger).toBeUndefined();
});

it('a version-131 arrow retains the previous trigger cancellation after Recall', () => {
  const r = giantConstructArena(true, 131);
  r.launch();
  r.until(0.6);
  expect(r.battle.nativeGiantArrowConstructs).toBeUndefined();
  expect(r.battle.nativeDefenses![r.towerId].trigger!.constructs).toBeUndefined();
  r.until(2);
  expect(towerCasts(r.battle)).toEqual([]);
});

it('Overgrowth-immune contacts cannot create a construct damage trigger', () => {
  const r = giantConstructArena();
  r.launch();
  r.battle.buildingEffects = { 2: { overgrownUntil: 10 }, 5: { overgrownUntil: 10 } };
  r.until(0.6);
  expect(
    r.battle.nativeGiantArrows![0].hit.filter((hit) => [2, 5].includes(hit.target.id)),
  ).toHaveLength(2);
  expect(r.battle.nativeDefenses![r.towerId].trigger).toBeUndefined();
  r.until(2);
  expect(towerCasts(r.battle)).toEqual([]);
});

it('a frozen tower cannot retain a construct that expires before its weapon clock can release', () => {
  const r = giantConstructArena();
  r.launch();
  r.until(0.6);
  expect(r.battle.nativeDefenses![r.towerId].trigger!.constructs).toHaveLength(1);
  (r.battle.buildingEffects ??= {})[r.towerId] = { frozenUntil: 3 };
  r.battle.defenseStuns[r.towerId] = 3;
  r.until(4.5);
  expect(r.battle.nativeDefenses![r.towerId].firedAt).toBeUndefined();
  expect(towerCasts(r.battle)).toEqual([]);
  expect(r.battle.nativeDefenses![r.towerId].trigger).toBeUndefined();
});

it.each(['rage', 'poison'] as const)(
  'an arrow does not become a proximity troop for %s towers',
  (mode) => {
    const r = giantConstructArena();
    r.battle.buildings.find((b) => b.id === r.towerId)!.spellMode = mode;
    r.launch();
    r.until(3.25);
    expect(r.battle.nativeDefenses![r.towerId].firedAt).toBeUndefined();
    expect(r.battle.nativeDefenses![r.towerId].trigger).toBeUndefined();
    expect(r.battle.units).toEqual([]);
  },
);

it.each([true, false])(
  'diagonal=%s construct state and tower release reconstruct through portable backward seeks',
  (diagonal) => {
    const r = giantConstructRecording(diagonal);
    const model = new GameModel();
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      model.seekReplay(snapshot.at);
      while (model.replay!.seeking) model.step(0.05);
      expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
    }
  },
);
