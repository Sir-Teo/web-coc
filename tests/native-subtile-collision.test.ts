import { describe, expect, it } from 'vitest';
import { makeBuilding, makeNpcBuilding, findPath, type Building } from '../src/game/model';
import { BUILDINGS, isTrap } from '../src/game/data';
import { NATIVE_CAMPAIGN, NATIVE_COMBAT, nativeLayout } from '../src/game/native-campaign';
import { groundCollision, passableSubtilesAtEdge, subtileSolid } from '../src/game/subtile-path';
import { replayBattle } from '../src/game/replay';
import { lateSetup } from './fixtures/late-defense-battle';

const ring = (): Building[] => {
  // A storage completely surrounded by touching 3×3 buildings: no free whole tile reaches it.
  const buildings = [makeBuilding(1, 'goldstorage', 20, 20, 10)];
  let id = 2;
  for (const [dx, dy] of [
    [-3, -3],
    [0, -3],
    [3, -3],
    [-3, 0],
    [3, 0],
    [-3, 3],
    [0, 3],
    [3, 3],
  ])
    buildings.push(makeBuilding(id++, 'cannon', 20 + dx, 20 + dy, 10));
  return buildings;
};

describe('client sub-tile building collision', () => {
  it('matches max(1, Width − BuildingW) for every building in all 90 source layouts', () => {
    for (const [index] of NATIVE_CAMPAIGN.entries())
      for (const b of nativeLayout(index)) {
        if (b.kind === 'wall' || isTrap(b.kind)) continue;
        const source = Object.values(NATIVE_COMBAT).find(
          (c) => c.size === BUILDINGS[b.kind].size && c.name !== undefined,
        );
        expect(source).toBeDefined();
      }
    const edges = new Map<string, number>();
    for (const [id, c] of Object.entries(NATIVE_COMBAT) as [
      string,
      (typeof NATIVE_COMBAT)[number] & { collision?: number },
    ][])
      if (c.collision !== undefined) edges.set(id, Math.max(1, c.size - c.collision));
    // Every campaign building leaves one passable sub-tile, except the Foreboding Cave's two.
    expect(new Set([...edges].filter(([id]) => id !== '1000062').map(([, edge]) => edge))).toEqual(
      new Set([1]),
    );
    expect(edges.get('1000062')).toBe(2);
    expect(passableSubtilesAtEdge(makeNpcBuilding(1, 'foreboding-cave', 10, 10))).toBe(2);
    expect(passableSubtilesAtEdge(makeNpcBuilding(1, 'goblin-hut', 10, 10))).toBe(1);
    expect(passableSubtilesAtEdge(makeBuilding(1, 'cannon', 10, 10, 1))).toBe(1);
  });

  it('keeps half-tile lanes between touching buildings for melee routes', () => {
    const buildings = ring();
    const target = buildings[0];
    // The former whole-tile grid has no route to a fully ringed building.
    expect(findPath({ x: 10.5, y: 21.5 }, target, buildings, 0.4)).toEqual([]);
    const route = findPath({ x: 10.5, y: 21.5 }, target, buildings, 0.4, true);
    expect(route.length).toBeGreaterThan(0);
    const end = route.at(-1)!;
    const solid = subtileSolid(buildings);
    for (const p of route) expect(solid(p.x, p.y)).toBe(false);
    // The approach ends within melee reach of the storage footprint.
    const dx = Math.max(target.x - end.x, 0, end.x - target.x - 3),
      dy = Math.max(target.y - end.y, 0, end.y - target.y - 3);
    expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(0.4);
  });

  it('blocks collision cores and whole wall tiles, and leaves a full-tile cave border', () => {
    const cannon = makeBuilding(1, 'cannon', 10, 10, 1);
    const wall = makeBuilding(2, 'wall', 20, 20, 1);
    const cave = makeNpcBuilding(3, 'foreboding-cave', 30, 30);
    const solid = subtileSolid([cannon, wall, cave]);
    expect(solid(10.25, 10.25)).toBe(false);
    expect(solid(10.75, 10.75)).toBe(true);
    expect(solid(12.75, 12.75)).toBe(false);
    expect(solid(20.1, 20.9)).toBe(true);
    expect(solid(30.75, 31.75)).toBe(false);
    expect(solid(31.25, 31.25)).toBe(true);
    expect(solid(32.75, 32.75)).toBe(true);
    expect(solid(33.25, 32.75)).toBe(false);
    // Walls remain breakable route tiles rather than impassable collision.
    const line = Array.from({ length: 30 }, (_, i) => makeBuilding(100 + i, 'wall', 15, i + 5, 1));
    const target = makeBuilding(99, 'goldmine', 18, 18, 1);
    const route = findPath({ x: 10.25, y: 19.25 }, target, line, 0.4, true);
    expect(route.some((p) => Math.floor(p.x) === 15)).toBe(true);
  });

  it('enables sub-tile collision only for version-44 native campaign battles', () => {
    const setup = lateSetup(70, { giant: 1 });
    expect(replayBattle(setup, 44).nativeSubtiles).toBe(true);
    expect(replayBattle(setup, 43).nativeSubtiles).toBeUndefined();
    const { catalog, scenery, ...legacy } = setup;
    void catalog;
    void scenery;
    expect(replayBattle({ ...legacy, index: 0 }, 44).nativeSubtiles).toBeUndefined();
    const tiles = groundCollision({}, ring());
    const lanes = groundCollision({ nativeSubtiles: true }, ring());
    expect(tiles.solid(19.75, 21.5)).toBe(true);
    expect(lanes.solid(19.75, 21.5)).toBe(false);
  });
});
