import { expect, it } from 'vitest';
import { BUILDINGS } from '../src/game/data';
import { MAP_SIZE, BUILD_MIN, BUILD_MAX } from '../src/game/grid';
import { GameModel, initialSave, makeBuilding, findPath, type Save } from '../src/game/model';
import { migrateSave, validateSave } from '../src/game/save';
import { validArrangement } from '../src/game/layout-migration';
import { validateReplay, REPLAY_VERSION } from '../src/game/replay';

function legacyVillage() {
  const save = initialSave();
  (save as unknown as { version: number }).version = 2;
  const cannon = save.buildings.find((b) => b.kind === 'cannon')!;
  // This was the actual pre-expansion opening Cannon placement.
  cannon.x = 9;
  cannon.y = 10;
  return save;
}

it('provides 44 buildable tiles and full 3×3 defense footprints at both map edges', () => {
  expect(BUILD_MAX - BUILD_MIN).toBe(44);
  const m = new GameModel();
  m.state.obstacles = [];
  m.townhall!.level = 8;
  for (const kind of ['cannon', 'archertower', 'mortar'] as const) {
    expect(BUILDINGS[kind].size).toBe(3);
    expect(m.canPlace(kind, 43, 43)).toBe(true);
    expect(m.canPlace(kind, 44, 43)).toBe(false);
    expect(m.canPlace(kind, 43, 44)).toBe(false);
    expect(m.canPlace(kind, 1, 2)).toBe(false);
  }
  m.beginBuild('cannon');
  expect(m.place(43, 43)).toBe(true);
  expect(m.canPlace('wall', 45, 45)).toBe(false);
  expect(m.canPlace('wall', 42, 45)).toBe(true);
  expect(m.canPlace('wall', 46, 45)).toBe(false);
  expect(validateSave(m.state)).toBe(true);
});

it('pathfinding and troop deployment reach defenses beyond the old map boundary', () => {
  const m = new GameModel();
  const target = makeBuilding(9000, 'cannon', 39, 38);
  const path = findPath({ x: 46.5, y: 45.5 }, target, [target], 0.7);
  expect(path.length).toBeGreaterThan(0);
  expect(path.every((p) => p.x >= 0 && p.y >= 0 && p.x < MAP_SIZE && p.y < MAP_SIZE)).toBe(true);
  expect(path.every((p) => !(p.x >= 39 && p.x < 42 && p.y >= 38 && p.y < 41))).toBe(true);
  m.startBattle(0, true);
  m.battle!.buildings = [target];
  expect(m.deployBlocked(46.5, 45.5)).toBe(false);
  expect(m.deploy(46.5, 45.5)).toBe(true);
  expect(m.deployBlocked(47.01, 45)).toBe(true);
});

it('migrates an actual legacy layout without changing progress, walls, obstacles or paid deadlines', () => {
  const old = legacyVillage();
  const cannon = old.buildings.find((b) => b.kind === 'cannon')!;
  cannon.hp = cannon.maxHp * 0.4;
  cannon.upgradeStart = old.lastTick - 1000;
  cannon.upgradeEnd = old.lastTick + 600000;
  old.gold = 4321;
  const before = structuredClone(old);
  const migrated = migrateSave(old) as Save;
  expect(migrated.version).toBe(3);
  expect(validateSave(migrated)).toBe(true);
  expect(migrated.buildings.map((b) => b.id)).toEqual(before.buildings.map((b) => b.id));
  for (const b of migrated.buildings) {
    const previous = before.buildings.find((p) => p.id === b.id)!;
    expect({ ...b, x: previous.x, y: previous.y }).toEqual(previous);
    if (b.id !== cannon.id) expect(b).toEqual(previous);
  }
  expect(migrated.obstacles).toEqual(before.obstacles);
  expect(migrated.mapUpgrade).toEqual({ moved: 1 });
  const { mapUpgrade: _notice, ...progress } = migrated;
  expect({ ...progress, version: 2, buildings: before.buildings }).toEqual(before);
  expect(migrateSave(structuredClone(migrated))).toEqual(migrated);
  const restored = new GameModel(structuredClone(migrated));
  expect(restored.state.gold).toBe(4321);
  expect(restored.state.buildings.find((b) => b.id === cannon.id)!.upgradeEnd).toBe(
    cannon.upgradeEnd,
  );
});

it('preserves every building in a densely packed legacy village and migrates deterministically', () => {
  const old = legacyVillage();
  old.buildings = [makeBuilding(1, 'townhall', 0, 0), makeBuilding(2, 'builder', 26, 26)];
  old.obstacles = [];
  old.nextId = 3;
  for (let y = 0; y < 28; y += 2)
    for (let x = 0; x < 28; x += 2) {
      if ((x < 4 && y < 4) || (x === 26 && y === 26)) continue;
      old.buildings.push(makeBuilding(old.nextId++, 'cannon', x, y));
    }
  expect(validArrangement(old.buildings, [], true)).toBe(true);
  const before = structuredClone(old);
  const migrated = migrateSave(old) as Save;
  expect(validateSave(migrated)).toBe(true);
  expect(migrated.buildings).toHaveLength(before.buildings.length);
  expect(migrated.buildings.some((b) => b.x >= 28 || b.y >= 28)).toBe(true);
  const reversed = { ...before, buildings: [...before.buildings].reverse() };
  const other = migrateSave(reversed) as Save;
  expect([...other.buildings].sort((a, b) => a.id - b.id)).toEqual(migrated.buildings);
});

it('migrates saved layout slots and restores them without changing a purchased upgrade', () => {
  const old = legacyVillage();
  const cannon = old.buildings.find((b) => b.kind === 'cannon')!;
  cannon.upgradeStart = old.lastTick - 1000;
  cannon.upgradeEnd = old.lastTick + 600000;
  old.layouts = [
    { name: 'Old layout', slots: old.buildings.map(({ id, x, y }) => ({ id, x, y })) },
    { name: 'Moved Cannon', slots: [{ id: cannon.id, x: 2, y: 20 }] },
  ];
  const migrated = migrateSave(old) as Save;
  const m = new GameModel(migrated);
  const first = m.state.buildings.map(({ id, x, y }) => ({ id, x, y }));
  m.loadLayout(1);
  expect(m.state.buildings.find((b) => b.id === cannon.id)).toMatchObject({
    x: 2,
    y: 20,
    upgradeEnd: cannon.upgradeEnd,
  });
  m.loadLayout(0);
  expect(m.state.buildings.map(({ id, x, y }) => ({ id, x, y }))).toEqual(first);
  expect(validateSave(m.state)).toBe(true);
});

it('rejects overlapping current and legacy saves instead of granting a repaired import', () => {
  for (const save of [initialSave(), legacyVillage()]) {
    save.buildings[1].x = save.buildings[0].x;
    save.buildings[1].y = save.buildings[0].y;
    const before = structuredClone(save.buildings);
    expect(validateSave(migrateSave(save))).toBe(false);
    expect(save.buildings).toEqual(before);
  }
});

it('keeps old replay snapshots valid at their old map edge and records new-map actions in version 12', () => {
  const m = new GameModel();
  m.startBattle(0, true);
  m.deploy(4, 11);
  m.finishBattle();
  const replay = structuredClone(m.state.raidLog![0].replay!);
  expect(REPLAY_VERSION).toBe(12);
  replay.initial.buildings = [makeBuilding(9000, 'cannon', 26, 26)];
  replay.initial.nextId = 9001;
  replay.version = 11;
  expect(validateReplay(replay)).toBe(true);
  replay.initial.buildings[0].x = 27;
  expect(validateReplay(replay)).toBe(false);
  replay.version = 12;
  replay.initial.buildings[0].x = 43;
  replay.initial.buildings[0].y = 43;
  replay.actions.unshift({ type: 'troop', kind: 'swordsman', x: 46.5, y: 45.5, step: 0 });
  expect(validateReplay(replay)).toBe(true);
});
