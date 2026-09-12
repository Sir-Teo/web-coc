import witness from './fixtures/native-dark-storage-mesh/manifest.json';
import { nativeMeshPoses, type NativeMatrix } from '../src/game/native-mesh';
import { expect, it } from 'vitest';
import source from '../reference/dark-storage/native.json';
import { DARK_STORAGE_LEVELS, darkStorageCapacity } from '../src/game/dark-storage-stats';
import { DARK_STORAGE_GRAPH, darkStoragePoses } from '../src/game/dark-storage-poses';
import { darkStorageFrame } from '../src/game/dark-storage-art';
import { darkStorageFill } from '../src/game/dark-storage-fill';
import {
  BUILDINGS,
  buildingHp,
  upgradeCost,
  upgradeSeconds,
  maxLevelFor,
  maxCountFor,
} from '../src/game/data';
import { requiredTownHall } from '../src/game/progression';
import { GameModel, makeBuilding } from '../src/game/model';
import { validateSave } from '../src/game/save';

it('uses all 13 inherited native storage rows for health, capacity, cost, time and requirements', () => {
  const inherited: Record<string, string> = {};
  for (const [index, row] of source.building.entries()) {
    Object.assign(inherited, row);
    const level = index + 1;
    expect(buildingHp('darkstorage', level)).toBe(Number(inherited.Hitpoints));
    expect(darkStorageCapacity(level)).toBe(Number(inherited.MaxStoredDarkElixir));
    expect(requiredTownHall('darkstorage', level)).toBe(Number(inherited.TownHallLevel));
    if (index) {
      expect(upgradeCost('darkstorage', index)).toBe(Number(inherited.BuildCost));
      expect(upgradeSeconds('darkstorage', index)).toBe(
        Number(inherited.BuildTimeD) * 86400 +
          Number(inherited.BuildTimeH) * 3600 +
          Number(inherited.BuildTimeM) * 60 +
          Number(inherited.BuildTimeS),
      );
    }
  }
  expect(BUILDINGS.darkstorage).toMatchObject({
    size: 3,
    hp: 2000,
    cost: 250000,
    build: 28800,
    maxLevel: 13,
  });
  expect(DARK_STORAGE_LEVELS.map((v) => v.capacity)).toEqual([
    10000, 17500, 40000, 75000, 140000, 180000, 220000, 280000, 330000, 360000, 390000, 420000,
    450000,
  ]);
  expect(Array.from({ length: 8 }, (_, i) => maxLevelFor('darkstorage', i + 1))).toEqual([
    0, 0, 0, 0, 0, 0, 2, 4,
  ]);
  expect(Array.from({ length: 8 }, (_, i) => maxCountFor('darkstorage', i + 1))).toEqual([
    0, 0, 0, 0, 0, 0, 1, 1,
  ]);
});

it('preserves all nine native fill states at every level, including empty and non-wrapping full', () => {
  for (const { level, export: name } of DARK_STORAGE_LEVELS) {
    const root = DARK_STORAGE_GRAPH.clips[DARK_STORAGE_GRAPH.exports[name]];
    const control = DARK_STORAGE_GRAPH.clips[root.children[root.names.indexOf('resource')]];
    expect(control.timeline).toHaveLength(160);
    const distinct = new Set();
    for (let frame = 0; frame < 160; frame++)
      distinct.add(JSON.stringify(darkStoragePoses(level, frame ? frame / 159 + 1e-12 : 0)));
    expect(distinct.size).toBe(9);
    expect(darkStoragePoses(level, 1)).not.toEqual(darkStoragePoses(level, 0));
    expect(darkStoragePoses(level, 100)).toEqual(darkStoragePoses(level, 1));
    expect(darkStoragePoses(level, NaN)).toEqual(darkStoragePoses(level, 0));
  }
  expect([0, -1, NaN, 0.0001, 0.5, 1, 2].map(darkStorageFrame)).toEqual([0, 0, 0, 1, 79, 159, 159]);
});

it('restores prototype health without destroying saved balances or counting unfinished storage', () => {
  const m = new GameModel();
  const storage = makeBuilding(m.state.nextId++, 'darkstorage', 2, 2, 2);
  storage.maxHp = 1875;
  storage.hp = 937.5;
  m.state.buildings.push(storage);
  m.state.obstacles = [];
  m.state.dark = 20000;
  m.tick(m.clock);
  expect(storage).toMatchObject({ hp: 1100, maxHp: 2200 });
  expect(m.resourceCap('dark')).toBe(17500);
  expect(m.state.dark).toBe(20000);
  expect(validateSave(m.state)).toBe(true);
  const restored = new GameModel(structuredClone(m.state));
  expect(restored.state.dark).toBe(20000);
  storage.constructing = true;
  expect(m.resourceCap('dark')).toBe(0);
});

it('upgrades using native destination values and keeps the home Town Hall limit', () => {
  const m = new GameModel();
  m.townhall!.level = 7;
  m.state.elixir = 1000000;
  const storage = makeBuilding(m.state.nextId++, 'darkstorage', 2, 2);
  m.state.buildings.push(storage);
  m.selected = storage.id;
  m.upgrade(storage.id);
  expect(m.state.elixir).toBe(500000);
  expect(storage.upgradeEnd! - m.clock).toBe(57600000);
  expect(m.resourceCap('dark')).toBe(10000);
  m.tick(storage.upgradeEnd!);
  expect(storage.level).toBe(2);
  expect(m.resourceCap('dark')).toBe(17500);
  m.state.elixir = 2000000;
  m.upgrade(storage.id);
  expect(storage.upgradeEnd).toBeUndefined();
  expect(m.state.elixir).toBe(2000000);
});

it('depletes each native storage from its own loot share and never reads the replay viewer balance', () => {
  const m = new GameModel();
  const storage = makeBuilding(1000, 'darkstorage', 10, 10, 5);
  expect(darkStorageFill(storage, null, 70000, 140000)).toBe(0.5);
  expect(darkStorageFill(storage, null, 200000, 140000)).toBe(1);
  m.startBattle(0, true);
  expect(darkStorageFill(storage, m.battle, 0, 0)).toBe(1);
  const b = m.battle!;
  Object.assign(b, {
    catalog: 'goblin-v1',
    practice: false,
    index: 51,
    availableLoot: { gold: 0, elixir: 0, dark: 1250 },
  });
  expect(darkStorageFill(storage, b, 0, 0)).toBe(0.5);
  storage.hp /= 2;
  expect(darkStorageFill(storage, b, 450000, 450000)).toBe(0.25);
  b.lootTaken = { gold: 0, elixir: 0, dark: 1000 }; // Damage to another holder does not empty this one twice.
  expect(darkStorageFill(storage, b, 0, 0)).toBe(0.25);
  b.availableLoot!.dark = 0;
  expect(darkStorageFill(storage, b, 450000, 450000)).toBe(0);
});

it.each(witness.cases)('matches Python source poses at storage level $level frame $frame', (c) => {
  const poses = nativeMeshPoses(
    DARK_STORAGE_GRAPH,
    c.export,
    0,
    { resource: c.frame },
    c.root as NativeMatrix,
  );
  expect(poses).toHaveLength(c.poses.length);
  for (const [i, pose] of poses.entries()) {
    const expected = c.poses[i];
    expect(pose.texture).toBe(expected.texture);
    expect(pose.vertices).toEqual(expected.vertices);
    expect(pose.blend).toBe(expected.blend);
    for (const field of ['matrix', 'multiply', 'add'] as const)
      for (const [j, value] of pose[field].entries())
        expect(value).toBeCloseTo(expected[field][j], 10);
  }
});
