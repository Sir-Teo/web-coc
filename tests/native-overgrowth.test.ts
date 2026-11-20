import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../src/game/replay';
function arena(version = REPLAY_VERSION) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 1),
    makeBuilding(2, 'builder', 10, 10, 1),
    makeBuilding(3, 'goldstorage', 14, 10, 15),
    makeBuilding(4, 'townhall', 18, 10, 1),
  ];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), overgrowth: 2 };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [];
  model.battle = replayBattle(data.initial, version);
  const run = (at: number) => {
    while (model.battle!.elapsed < at - 1e-9) model.step(0.05);
  };
  const cast = () => {
    model.activeSpell = 'overgrowth';
    expect(model.castSpell(16, 11)).toBe(true);
  };
  return { model, run, cast };
}
it('an actual cast records all original footprint lifetimes at the source pulse', () => {
  const a = arena();
  a.cast();
  a.run(1.45);
  expect(a.model.battle!.nativeOvergrowthRoots).toBeUndefined();
  a.run(1.5);
  expect(a.model.battle!.nativeOvergrowthRoots).toEqual(
    [2, 3, 4].map((id) => ({
      key: `overgrowth:1:${id}`,
      buildingId: id,
      x: id === 2 ? 11 : id === 3 ? 15.5 : 20,
      y: id === 2 ? 11 : id === 3 ? 11.5 : 12,
      size: id,
      at: 1.5,
      until: 23.5,
    })),
  );
});
it('overlapping casts extend the deployed roots without restarting growth', () => {
  const a = arena();
  a.cast();
  a.run(5);
  const before = structuredClone(a.model.battle!.nativeOvergrowthRoots!);
  a.cast();
  a.run(6.5);
  const after = a.model.battle!.nativeOvergrowthRoots!;
  expect(after).toHaveLength(3);
  for (let i = 0; i < 3; i++) {
    expect(after[i].key).toBe(before[i].key);
    expect(after[i].at).toBe(1.5);
    expect(after[i].until).toBeCloseTo(28.5, 8);
  }
});
it('expired roots keep their retract history and a later cast starts a new cycle', () => {
  const a = arena();
  a.cast();
  a.run(24);
  a.cast();
  a.run(25.5);
  const roots = a.model.battle!.nativeOvergrowthRoots!;
  expect(roots).toHaveLength(6);
  expect(roots.filter((r) => r.at === 1.5)).toHaveLength(3);
  expect(
    roots
      .filter((r) => r.key.startsWith('overgrowth:2:'))
      .every((r) => Math.abs(r.at - 25.5) < 1e-8),
  ).toBe(true);
  a.run(34);
  expect(a.model.battle!.nativeOvergrowthRoots).toHaveLength(3);
});
it('presentation capture preserves physical spell behavior and version 112 omits new records', () => {
  const current = arena(113),
    old = arena(112);
  current.cast();
  old.cast();
  current.run(2);
  old.run(2);
  const now = JSON.parse(JSON.stringify(current.model.battle)),
    then = JSON.parse(JSON.stringify(old.model.battle));
  expect(now.nativeOvergrowthRoots).toHaveLength(3);
  expect(then.nativeOvergrowthRoots).toBeUndefined();
  delete now.nativeOvergrowthRoots;
  delete now.nativeOvergrowthPresentation;
  delete now.nativeOvergrowthCastPresentation;
  delete now.nativeOvergrowthCasts;
  delete now.nativeFreezeCastPresentation;
  delete now.nativeSpellArt;
  delete now.nativeRecallPresentation;
  delete now.nativeReviveTargets;
  delete now.nativeRecallEvents;
  delete now.nativeSpellPulsePresentation;
  delete now.nativeSpellEffectTimelines;
  expect(now).toEqual(then);
});

it.each([270, 271])('Overgrowth reveal respects replay version %i', (version) => {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 12),
    makeBuilding(2, 'tesla', 20, 20, 1),
    makeBuilding(3, 'tesla', 32, 32, 1),
  ];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), overgrowth: 1 };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  const battle = (model.battle = replayBattle(data.initial, version));
  model.activeSpell = 'overgrowth';
  expect(model.castSpell(21, 21)).toBe(true);
  for (let i = 0; i < 32; i++) model.step(0.05);
  expect(battle.buildingEffects?.[2].overgrownUntil).toBeCloseTo(23.5);
  expect(battle.defenseStuns[2]).toBeCloseTo(23.5);
  expect(battle.revealedTeslas?.[2]).toBe(version === 271 ? 1.5 : undefined);
  expect(battle.revealedTeslas?.[3]).toBeUndefined();
  for (let i = 0; i < 450; i++) model.step(0.05);
  expect(battle.elapsed).toBeGreaterThan(battle.defenseStuns[2]);
  expect(battle.revealedTeslas?.[2]).toBe(version === 271 ? 1.5 : undefined);
});
