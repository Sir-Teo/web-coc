import { expect, it } from 'vitest';
import { fundedVillage } from './fixtures/funded-village';
import {
  BUILDINGS,
  buildingHp,
  maxCountFor,
  maxLevelFor,
  upgradeCost,
  upgradeSeconds,
} from '../src/game/data';
import { campCapacity } from '../src/game/camp-stats';
import { GameModel, initialSave, makeBuilding } from '../src/game/model';
import { emptyArmy } from '../src/game/army';
import { validateSave } from '../src/game/save';
import { REPLAY_VERSION, validateReplay } from '../src/game/replay';

it('uses source-backed capacity, hitpoints, prices and times at every supported camp level', () => {
  expect(Array.from({ length: 8 }, (_, i) => campCapacity(i + 1))).toEqual([
    20, 30, 35, 40, 45, 50, 55, 60,
  ]);
  expect(Array.from({ length: 8 }, (_, i) => buildingHp('camp', i + 1))).toEqual([
    100, 150, 200, 250, 300, 330, 400, 500,
  ]);
  expect([
    BUILDINGS.camp.cost,
    ...Array.from({ length: 7 }, (_, i) => upgradeCost('camp', i + 1)),
  ]).toEqual([200, 2000, 10000, 100000, 250000, 500000, 1500000, 2500000]);
  expect([
    BUILDINGS.camp.build,
    ...Array.from({ length: 7 }, (_, i) => upgradeSeconds('camp', i + 1)),
  ]).toEqual([60, 300, 1800, 7200, 21600, 43200, 172800, 259200]);
});

it('starts with one completed level-2 camp and follows native TH1–8 housing ceilings', () => {
  const m = new GameModel();
  expect(m.countOf('camp')).toBe(1);
  expect(m.state.buildings.find((b) => b.kind === 'camp')!.level).toBe(2);
  expect(m.capacity).toBe(30);
  expect(m.armySize).toBeLessThanOrEqual(30);
  expect(Array.from({ length: 9 }, (_, i) => maxCountFor('camp', i + 1))).toEqual([
    1, 1, 2, 2, 3, 3, 4, 4, 4,
  ]);
  expect(
    Array.from(
      { length: 8 },
      (_, i) => maxCountFor('camp', i + 1) * campCapacity(maxLevelFor('camp', i + 1)),
    ),
  ).toEqual([20, 30, 70, 80, 135, 150, 200, 200]);
  m.state.buildings = m.state.buildings.filter((b) => b.kind !== 'camp');
  expect(m.capacity).toBe(0);
  m.train('archer');
  expect(m.state.army.archer).toBe(10);
});

it('charges once, keeps capacity while upgrading, and adds only the earned spaces after reload', () => {
  const m = fundedVillage();
  m.townhall!.level = 3;
  const camp = m.state.buildings.find((b) => b.kind === 'camp')!;
  const elixir = m.state.elixir;
  m.upgrade(camp.id);
  expect(m.state.elixir).toBe(elixir - 10000);
  expect(camp.upgradeEnd! - camp.upgradeStart!).toBe(1800000);
  expect(m.capacity).toBe(30);
  m.upgrade(camp.id);
  expect(m.state.elixir).toBe(elixir - 10000);
  const restored = new GameModel(structuredClone(m.state));
  restored.tick(camp.upgradeEnd! - 1);
  expect(restored.capacity).toBe(30);
  restored.tick(camp.upgradeEnd!);
  restored.tick(camp.upgradeEnd! + 1);
  expect(restored.capacity).toBe(35);
  expect(restored.state.elixir).toBe(elixir - 10000);
  expect(restored.state.buildings.find((b) => b.id === camp.id)).toMatchObject({
    level: 3,
    hp: 200,
    maxHp: 200,
  });
  expect(validateSave(restored.state)).toBe(true);
});

it('a constructing camp contributes nothing until it finishes and enforces its Town Hall count', () => {
  const m = new GameModel();
  m.state.obstacles = [];
  m.beginBuild('camp');
  expect(m.placement).toBeNull();
  m.townhall!.level = 3;
  const elixir = m.state.elixir;
  m.beginBuild('camp');
  expect(m.place(30, 30)).toBe(true);
  expect(m.state.elixir).toBe(elixir - 200);
  expect(m.capacity).toBe(30);
  const camp = m.state.buildings.at(-1)!;
  expect(camp.upgradeEnd! - camp.upgradeStart!).toBe(60000);
  m.tick(camp.upgradeEnd!);
  expect(m.capacity).toBe(50);
  expect(camp.level).toBe(1);
  m.beginBuild('camp');
  expect(m.placement).toBeNull();
});

it('keeps legacy prepared troops, camps, damaged-health fraction and paid deadlines without a permanent capacity bonus', () => {
  const old = initialSave();
  const camp = old.buildings.find((b) => b.kind === 'camp')!;
  camp.level = 1;
  camp.maxHp = 700;
  camp.hp = 280;
  camp.upgradeStart = old.lastTick - 1000;
  camp.upgradeEnd = old.lastTick + 600000;
  old.buildings.push(makeBuilding(old.nextId++, 'camp', 21, 11));
  old.army = { ...emptyArmy(), swordsman: 55 };
  const before = structuredClone(old);
  const m = new GameModel(old);
  expect(m.countOf('camp')).toBe(2);
  expect(m.capacity).toBe(40);
  expect(m.state.army).toEqual(before.army);
  expect(camp).toMatchObject({
    hp: 40,
    maxHp: 100,
    upgradeStart: before.buildings.find((b) => b.id === camp.id)!.upgradeStart,
    upgradeEnd: before.buildings.find((b) => b.id === camp.id)!.upgradeEnd,
  });
  m.train('swordsman');
  expect(m.state.army.swordsman).toBe(55);
  expect(validateSave(m.state)).toBe(true);
  m.startBattle(0);
  m.activeTroop = 'swordsman';
  expect(m.deploy(1, 13)).toBe(true);
  expect(m.state.army.swordsman).toBe(54);
  m.finishBattle();
  m.returnHome();
  expect(m.state.gold).toBe(before.gold);
  expect(m.state.elixir).toBe(before.elixir);
  const restored = new GameModel(structuredClone(m.state));
  expect(restored.state.army.swordsman).toBe(54);
  expect(restored.capacity).toBe(40);
  // The old purchase keeps its 10-minute deadline even though a new level-2
  // purchase now takes five minutes. Reload must neither shorten nor restart it.
  restored.tick(before.lastTick + 300000);
  expect(restored.capacity).toBe(40);
  expect(restored.state.buildings.find((b) => b.id === camp.id)!.upgradeEnd).toBe(camp.upgradeEnd);
  restored.tick(camp.upgradeEnd!);
  expect(restored.capacity).toBe(50);
  expect(restored.state.army.swordsman).toBe(54);
});

it('records native camp health while retaining old snapshots as incompatible summaries', () => {
  const m = new GameModel();
  m.startBattle(0, true);
  m.finishBattle();
  const replay = structuredClone(m.state.raidLog![0].replay!);
  expect(replay.version).toBe(REPLAY_VERSION);
  expect(replay.initial.buildings.find((b) => b.kind === 'camp')).toMatchObject({
    hp: 150,
    maxHp: 150,
  });
  replay.version = 13;
  const camp = replay.initial.buildings.find((b) => b.kind === 'camp')!;
  camp.hp = camp.maxHp = 700;
  expect(validateReplay(replay)).toBe(true);
  expect(camp.hp).toBe(700);
});
