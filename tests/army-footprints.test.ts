import { expect, it } from 'vitest';
import { BUILDINGS } from '../src/game/data';
import { GameModel, initialSave, makeBuilding, findPath, type Save } from '../src/game/model';
import { migrateSave, validateSave } from '../src/game/save';
import { validArrangement } from '../src/game/layout-migration';
import { validateReplay } from '../src/game/replay';
import { legacyArmyVillage, overfullArmyVillage } from './fixtures/legacy-army-village';

it.each(['camp', 'herohall'] as const)(
  '%s occupies all sixteen tiles for placement, paths and combat',
  (kind) => {
    expect(BUILDINGS[kind].size).toBe(4);
    const m = new GameModel();
    m.state.obstacles = [];
    expect(m.canPlace(kind, 42, 42)).toBe(true);
    expect(m.canPlace(kind, 43, 42)).toBe(false);
    const target = makeBuilding(9000, kind, 42, 42);
    m.state.buildings.push(target);
    m.state.nextId = 9001;
    expect(m.canPlace('wall', 45, 45)).toBe(false);
    expect(m.canPlace('wall', 41, 45)).toBe(true);
    const path = findPath({ x: 46.5, y: 46.5 }, target, [target], 0.7);
    expect(path.length).toBeGreaterThan(0);
    expect(path.every((p) => p.x < 42 || p.x >= 46 || p.y < 42 || p.y >= 46)).toBe(true);
    m.startBattle(0, true);
    expect(m.deployBlocked(45.5, 45.5)).toBe(true);
    expect(validateSave(m.state)).toBe(true);
  },
);

it('moves only conflicting army buildings, preserves purchased progress and migrates layouts without mutating input', () => {
  const old = legacyArmyVillage();
  old.layouts = [
    { name: 'Saved village', slots: old.buildings.map(({ id, x, y }) => ({ id, x, y })) },
    { name: 'Alternate camp', slots: [{ id: 4, x: 30, y: 30 }] },
  ];
  const before = structuredClone(old);
  expect(validArrangement(old.buildings, old.obstacles, 3)).toBe(true);
  const migrated = migrateSave(old) as Save;
  expect(old).toEqual(before);
  expect(validateSave(migrated)).toBe(true);
  expect(migrated.mapUpgrade).toEqual({ moved: 2 });
  for (const b of migrated.buildings) {
    const previous = old.buildings.find((p) => p.id === b.id)!;
    expect({ ...b, x: previous.x, y: previous.y }).toEqual(previous);
    if (b.kind !== 'camp' && b.kind !== 'herohall') expect(b).toEqual(previous);
  }
  expect(migrated.obstacles).toEqual(old.obstacles);
  expect(migrated.king).toEqual(old.king);
  expect(migrated.gold).toBe(old.gold);
  const { mapUpgrade: _notice, ...progress } = migrated;
  expect({ ...progress, version: 3, buildings: old.buildings, layouts: old.layouts }).toEqual(old);
  const model = new GameModel(migrated);
  const positions = model.state.buildings.map(({ id, x, y }) => ({ id, x, y }));
  model.loadLayout(1);
  expect(model.state.buildings.find((b) => b.kind === 'camp')).toMatchObject({ x: 30, y: 30 });
  expect(validArrangement(model.state.buildings, model.state.obstacles)).toBe(true);
  model.loadLayout(0);
  expect(model.state.buildings.map(({ id, x, y }) => ({ id, x, y }))).toEqual(positions);
  expect(migrateSave(structuredClone(migrated))).toEqual(migrated);
});

it('rearranges a fragmented village deterministically when no free 4×4 site exists', () => {
  const old = initialSave();
  (old as unknown as { version: number }).version = 3;
  old.buildings = [
    makeBuilding(1, 'townhall', 2, 2),
    makeBuilding(2, 'builder', 6, 2),
    makeBuilding(3, 'camp', 9, 9),
  ];
  old.obstacles = [];
  delete old.obstacleGrowth;
  old.nextId = 4;
  for (let y = 2; y < 46; y += 3)
    for (let x = 2; x < 46; x += 3) {
      const wall = makeBuilding(old.nextId, 'wall', x, y);
      if (validArrangement([...old.buildings, wall], [], 3)) {
        old.buildings.push(wall);
        old.nextId++;
      }
    }
  old.buildings.push(makeBuilding(old.nextId++, 'wall', 12, 9));
  old.buildings.push(makeBuilding(old.nextId++, 'wall', 12, 12));
  old.buildings.push(makeBuilding(old.nextId++, 'wall', 9, 12));
  old.obstacles = [
    {
      id: 37,
      kind: 'rocks',
      x: 20,
      y: 20,
      removeStart: old.lastTick - 1000,
      removeEnd: old.lastTick + 9000,
    },
  ];
  old.buildings = old.buildings.filter((b) => validArrangement([b], old.obstacles, 3));
  expect(validArrangement(old.buildings, old.obstacles, 3)).toBe(true);
  const migrated = migrateSave(old) as Save;
  expect(validateSave(migrated)).toBe(true);
  expect(migrated.buildings).toHaveLength(old.buildings.length);
  expect({ ...migrated.obstacles![0], x: 20, y: 20 }).toEqual(old.obstacles[0]);
  expect(
    migrated.buildings.filter((b, i) => b.x !== old.buildings[i].x || b.y !== old.buildings[i].y)
      .length,
  ).toBeGreaterThan(10);
  const reversed = migrateSave({ ...old, buildings: [...old.buildings].reverse() }) as Save;
  expect([...reversed.buildings].sort((a, b) => a.id - b.id)).toEqual(migrated.buildings);
});

it('leaves a physically overfull custom village intact for recovery', () => {
  const old = overfullArmyVillage();
  expect(validArrangement(old.buildings, [], 3)).toBe(true);
  const before = structuredClone(old);
  expect(migrateSave(old)).toEqual(before);
  expect(old).toEqual(before);
  expect(validateSave(old)).toBe(false);
});

it('validates historical camp and hall snapshots at their original edges without rewriting them', () => {
  const m = new GameModel();
  m.startBattle(0, true);
  m.finishBattle();
  const replay = structuredClone(m.state.raidLog![0].replay!);
  for (const kind of ['camp', 'herohall'] as const) {
    replay.initial.buildings = [makeBuilding(9000, kind, 25, 25)];
    replay.initial.nextId = 9001;
    replay.version = 11;
    expect(validateReplay(replay)).toBe(true);
    replay.initial.buildings[0].x = 26;
    expect(validateReplay(replay)).toBe(false);
    replay.version = 12;
    replay.initial.buildings[0].x = replay.initial.buildings[0].y = 45;
    expect(validateReplay(replay)).toBe(true);
    const before = structuredClone(replay);
    replay.version = 13;
    expect(validateReplay(replay)).toBe(false);
    replay.initial.buildings[0].x = replay.initial.buildings[0].y = 44;
    expect(validateReplay(replay)).toBe(true);
    expect(before.initial.buildings[0].x).toBe(45);
  }
});
