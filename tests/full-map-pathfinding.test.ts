import { beforeEach, expect, it } from 'vitest';
import { battleMapSize, FULL_MAP_SIZE, MAP_SIZE } from '../src/game/grid';
import {
  makeBuilding,
  findPath,
  pathReachability,
  separateUnits,
  breachTarget,
} from '../src/game/model';
import { separationCrowd } from './fixtures/crowd-separation';
import {
  findSubtilePath,
  groundCollision,
  resetSubtileGrids,
  subtileReachability,
  subtileSolid,
} from '../src/game/subtile-path';

beforeEach(resetSubtileGrids);

it('keeps home bounds as the default', () => {
  expect(battleMapSize()).toBe(MAP_SIZE);
  expect(battleMapSize(null)).toBe(MAP_SIZE);
  expect(battleMapSize({})).toBe(MAP_SIZE);
  expect(battleMapSize({ boardSize: FULL_MAP_SIZE })).toBe(52);
});

it('routes to source deployment coordinates beyond the legacy board', () => {
  const start = { x: 51.25, y: 12.25 };
  const target = { x: 50.25, y: 12.25 };
  const full = findSubtilePath(start, target, [], 0, false, FULL_MAP_SIZE);
  expect(full).toEqual([target]);
  expect(findSubtilePath(start, target, [], 0)).toEqual([]);
  expect(findSubtilePath(start, target, [], 0, false, FULL_MAP_SIZE)).toEqual(full);
});

it('keeps collision closures and cached routes bound to their board stride', () => {
  const buildings = [makeBuilding(1, 'wall', 4, 5, 1)];
  const oldSolid = subtileSolid(buildings);
  const fullSolid = subtileSolid(buildings, FULL_MAP_SIZE);
  for (let i = 0; i < 8; i++) {
    findSubtilePath(
      { x: 1.25, y: 5.25 },
      { x: 8.25, y: 5.25 },
      buildings,
      0,
      false,
      i % 2 ? FULL_MAP_SIZE : MAP_SIZE,
    );
    expect(oldSolid(4.25, 5.25)).toBe(true);
    expect(fullSolid(4.25, 5.25)).toBe(true);
    expect(oldSolid(8.25, 5.25)).toBe(false);
    expect(fullSolid(8.25, 5.25)).toBe(false);
  }
});

it('finds connected ground on both sides of the old border without wrapping rows', () => {
  const wall = makeBuilding(1, 'wall', 48, 12, 1);
  const reachable = subtileReachability({ x: 51.25, y: 12.25 }, [wall], FULL_MAP_SIZE);
  expect(reachable(makeBuilding(2, 'wall', 50, 12, 1))).toBe(true);
  expect(reachable(wall)).toBe(false);
  const solid = subtileSolid([wall], FULL_MAP_SIZE);
  expect(solid(48.25, 12.25)).toBe(true);
  expect(solid(0.25, 13.25)).toBe(false);
});

it.each([false, true])(
  'uses distinct collision cell IDs across the old border (subtiles=%s)',
  (native) => {
    const buildings = [makeBuilding(1, 'wall', 48, 12, 1)];
    const collision = groundCollision(
      { boardSize: FULL_MAP_SIZE, ...(native ? { nativeSubtiles: true as const } : {}) },
      buildings,
    );
    expect(collision.cell(48.25, 12.25)).not.toBe(collision.cell(0.25, 13.25));
    expect(collision.solid(48.25, 12.25)).toBe(true);
    expect(collision.solid(0.25, 13.25)).toBe(false);
  },
);

it.each([false, true])(
  'routes and separates crowds on the full board (subtiles=%s)',
  (subtiles) => {
    const start = { x: 51.25, y: 12.25 },
      target = { x: 50.5, y: 12.5 };
    const path = findPath(start, target, [], 0, subtiles, [], false, FULL_MAP_SIZE);
    expect(path.length).toBeGreaterThan(0);
    expect(path.at(-1)).toEqual(target);
    expect(findPath(start, target, [], 0, subtiles)).toEqual([]);
    expect(findPath(start, target, [], 0, subtiles, [], false, FULL_MAP_SIZE)).toEqual(path);
    expect(
      pathReachability(start, [], subtiles, FULL_MAP_SIZE)(makeBuilding(1, 'wall', 50, 12, 1)),
    ).toBe(true);
    const units = separationCrowd(2, 0);
    for (const unit of units) {
      unit.x = 50.5;
      unit.y = 12.5;
    }
    const before = structuredClone(units);
    separateUnits(units, [], subtiles, 0.1, FULL_MAP_SIZE);
    expect(units).not.toEqual(before);
    const expected = structuredClone(units);
    separateUnits(structuredClone(before), [], subtiles, 0.1);
    const again = structuredClone(before);
    separateUnits(again, [], subtiles, 0.1, FULL_MAP_SIZE);
    expect(again).toEqual(expected);
  },
);

it('finds wall obstructions beyond the legacy board and isolates breach indexes', () => {
  const buildings = [makeBuilding(1, 'goldstorage', 49, 10, 1)];
  let id = 2;
  for (let y = 0; y < FULL_MAP_SIZE; y++) buildings.push(makeBuilding(id++, 'wall', 48, y, 1));
  const start = { x: 46.5, y: 11.5 };
  expect(breachTarget(start, buildings, false, FULL_MAP_SIZE)?.kind).toBe('wall');
  expect(breachTarget(start, buildings)).toBeUndefined();
  expect(breachTarget(start, buildings, false, FULL_MAP_SIZE)?.kind).toBe('wall');
});
