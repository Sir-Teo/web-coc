import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { spawnSkeleton } from '../src/game/defenders';
import { stepEquipmentDash } from '../src/game/native-equipment-effects';
import { attacker } from './fixtures/late-defense-battle';
import type { NativeTroopContext } from '../src/game/native-troops';
import { equipmentDashDefenderRecording } from './fixtures/equipment-dash-defenders';
import { replayBattle, validateReplay } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

function arena(count = 2, legacy = false) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = emptySpells();
  model.state.king = undefined;
  model.startBattle(0, true);
  const battle = model.battle!;
  if (legacy) delete battle.nativeEquipmentDashHits;
  battle.defenders = [];
  for (let i = 0; i < count; i++) {
    const defender = spawnGarrisonDefender(
      battle,
      i % 2 ? 'archer' : 'dragon',
      i % 2 ? 9 : 5,
      1,
      10.1,
      10,
      0,
    );
    defender.hp = defender.maxHp = 2000;
  }
  const unit = attacker(100, 'giant', 10, 10);
  unit.native = {
    dash: { dx: 1, dy: 0, remaining: 3, speed: 1, damage: 575, radius: 1.5, hit: [] },
  };
  const ctx: NativeTroopContext = {
    battle,
    buildings: battle.buildings,
    buildingsById: new Map(battle.buildings.map((building) => [building.id, building])),
    passableWalls: new Set(),
    damageBuilding: () => {},
    effect: () => {},
    nextId: () => 1000,
    troopLevel: () => 1,
  };
  return { battle, unit, step: () => stepEquipmentDash(ctx, unit, 0.2) };
}

it.each([1, 2, 4])('a dash hits each of %s overlapping air/ground defenders once', (count) => {
  const { battle, unit, step } = arena(count);
  step();
  expect(battle.defenders!.map((defender) => defender.hp)).toEqual(Array(count).fill(2000 - 575));
  expect(unit.native!.dash!.hit).toHaveLength(count);
  step();
  expect(battle.defenders!.map((defender) => defender.hp)).toEqual(Array(count).fill(2000 - 575));
});

it('keeps the version-68 repeated area-hit behavior', () => {
  const { battle, step } = arena(2, true);
  step();
  expect(battle.defenders!.map((defender) => defender.hp)).toEqual([
    2000 - 575 * 2,
    2000 - 575 * 2,
  ]);
});

it('does not spend a dash hit on a defender that has not spawned yet', () => {
  const { battle, unit, step } = arena(1);
  const defender = battle.defenders![0];
  defender.spawnedAt = 1;
  step();
  expect(defender.hp).toBe(2000);
  expect(unit.native!.dash!.hit).toEqual([]);
  battle.elapsed = 1;
  step();
  expect(defender.hp).toBe(2000 - 575);
});

it('does not hurt or consume a hit on an unborn trap Skeleton', () => {
  const { battle, unit, step } = arena(0);
  const defender = spawnSkeleton(battle, makeBuilding(2, 'skeletontrap', 10, 10, 5), 1, 0);
  const hp = defender.hp;
  step();
  expect(defender.hp).toBe(hp);
  expect(unit.native!.dash!.hit).toEqual([]);
});

it('reconstructs an actual Rocket Backpack pass through portable backward seeks and version 68', () => {
  const { data, snapshots, damage, defenderIds, crossed } = equipmentDashDefenderRecording();
  expect(validateReplay(data)).toBe(true);
  expect(replayBattle(data.initial, 69).nativeEquipmentDashHits).toBe(true);
  expect(replayBattle(data.initial, 68).nativeEquipmentDashHits).toBeUndefined();
  const viewer = new GameModel();
  expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
  for (const snapshot of [...snapshots].reverse()) {
    viewer.seekReplay(snapshot.at);
    while (viewer.replay!.seeking) viewer.step(0.05);
    expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
  }
  const losses = () =>
    defenderIds.map((id) => {
      const defender = viewer.battle!.defenders!.find((d) => d.id === id)!;
      return defender.maxHp - defender.hp;
    });
  viewer.seekReplay(crossed);
  while (viewer.replay!.seeking) viewer.step(0.05);
  expect(losses()).toEqual([damage, damage]);
  expect(viewer.openReplay({ ...data, version: 68 })).toBe(true);
  viewer.seekReplay(crossed);
  while (viewer.replay!.seeking) viewer.step(0.05);
  expect(losses()).toEqual([damage * 2, damage * 2]);
});
