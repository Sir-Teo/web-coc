import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { GameModel, makeBuilding } from '../src/game/model';
import { BUILD_MIN } from '../src/game/grid';
import { TRADER_TOWN_HALL } from '../src/game/trader';
import { treeGrowthSites } from '../src/game/obstacles';
import {
  VILLAGE_FEATURES,
  VILLAGE_OBJECTS,
  villageObjectFootprint,
  villageObjectFootprints,
  villageObjects,
} from '../src/game/village-objects';

function village(townhall: number) {
  const m = new GameModel();
  m.state.buildings = [makeBuilding(1, 'townhall', 20, 20, townhall)];
  m.state.obstacles = [];
  m.state.nextId = 100;
  return m;
}
const pngSize = (path: string) => {
  const png = readFileSync(`public/${path}`);
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
};

describe('village objects', () => {
  it('reads the Trader’s camp and the Super Troop building from the client', () => {
    expect(VILLAGE_OBJECTS.map((o) => o.id)).toEqual([
      'trader-tent',
      'trader-pots',
      'trader-rug',
      'trader-sign',
      'trader',
      'super-troops',
    ]);
    // One level past the client's globals, as the wiki states and the game's rules use.
    expect(VILLAGE_FEATURES.trader).toMatchObject({ name: 'Trader Shop', townhall: 6 });
    expect(VILLAGE_FEATURES.trader.townhall).toBe(TRADER_TOWN_HALL);
    expect(VILLAGE_FEATURES.super).toMatchObject({ name: 'Super Troops', townhall: 11 });
    // The client's TraderBuilding row (TileX100 −450, TileY100 2850), moved onto this field.
    const tent = VILLAGE_OBJECTS[0];
    expect([tent.x, tent.y]).toEqual([-4.5 + BUILD_MIN, 28.5 + BUILD_MIN]);
    expect(VILLAGE_OBJECTS.find((o) => o.id === 'super-troops')!.art.active).toBeDefined();
    for (const o of VILLAGE_OBJECTS)
      for (const art of Object.values(o.art)) {
        expect(pngSize(art.path), art.path).toEqual([art.width, art.height]);
        expect(art.originX).toBeGreaterThan(0);
        expect(art.originY).toBeLessThan(1);
      }
  });

  it('shows the camp from Town Hall 6 and the Super Troop building from Town Hall 11', () => {
    expect(villageObjects(5)).toEqual([]);
    expect(villageObjects(6).map((o) => o.opens)).toEqual(Array(5).fill('trader'));
    expect(villageObjects(10)).toHaveLength(5);
    expect(villageObjects(11).at(-1)).toMatchObject({ id: 'super-troops', opens: 'super-troops' });
  });

  it('stand beside the field, reaching at most its outer edge', () => {
    for (const o of VILLAGE_OBJECTS) {
      const f = villageObjectFootprint(o);
      // Clear of every building tile.
      expect(f.x + f.size, o.id).toBeLessThanOrEqual(BUILD_MIN);
    }
    expect(villageObjectFootprints(11)).toHaveLength(6);
  });

  it('keep decorations and regrowing obstacles off the edge tiles they stand on', () => {
    const young = village(5),
      m = village(6);
    // The Trader's pots stand on the field's outer edge at (0, 28).
    expect(young.overlapsVillageObject(0, 28, 1)).toBe(false);
    expect(m.overlapsVillageObject(0, 28, 1)).toBe(true);
    expect(m.overlapsVillageObject(1, 28, 1)).toBe(false);
    expect(young.canPlaceDecoration('torch', 0, 28)).toBe(true);
    expect(m.canPlaceDecoration('torch', 0, 28)).toBe(false);
    expect(m.canPlaceDecoration('torch', 1, 28)).toBe(true);
    // Growth keeps its tile of space from them as from decorations.
    const sites = treeGrowthSites(m.state.buildings, [], 1, villageObjectFootprints(6));
    expect(sites.some((s) => s.x <= 1 && s.y >= 27 && s.y <= 33)).toBe(false);
    expect(sites.some((s) => s.x === 0 && s.y === 20)).toBe(true);
  });
});
