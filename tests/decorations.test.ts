import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import catalog from '../reference/decorations/catalog.json' with { type: 'json' };
import { GameModel, makeBuilding } from '../src/game/model';
import { validateSave } from '../src/game/save';
import { MAP_SIZE } from '../src/game/grid';
import { DECORATIONS, DECORATION_KINDS, DECORATION_TEXTS } from '../src/game/decorations';
import { OBSTACLE_GROWTH_INTERVAL, treeGrowthSites } from '../src/game/obstacles';
import { chiefProgress } from '../src/game/experience';

/** Experience points that reach a Chief level. */
const xpFor = (level: number) => {
  let xp = 0;
  while (chiefProgress(xp).level < level) xp += 50;
  return xp;
};
function village() {
  const m = new GameModel();
  m.state.buildings = [makeBuilding(1, 'townhall', 20, 20, 9), makeBuilding(2, 'builder', 30, 30)];
  m.state.obstacles = [];
  m.state.nextId = 100;
  m.state.gold = m.state.elixir = 2_000_000;
  m.state.gems = 1000;
  m.state.xp = 0;
  return m;
}
const pngSize = (path: string) => {
  const png = readFileSync(`public/${path}`);
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
};

describe('decorations', () => {
  it('sells the client Shop rows at the wiki prices, limits and levels', () => {
    expect(
      DECORATION_KINDS.map((k) => {
        const d = DECORATIONS[k];
        return [d.name, d.resource, d.cost, d.max, d.chiefLevel, d.size];
      }),
    ).toEqual([
      ['Torch', 'elixir', 500, 4, 1, 2],
      ['White Flag', 'elixir', 5000, 1, 5, 2],
      ['Cornflower Bed', 'elixir', 2500, 4, 8, 2],
      ['Sunflower Bed', 'elixir', 2500, 4, 8, 2],
      ['Weather Vane', 'elixir', 10000, 1, 10, 2],
      ['Rally Flag', 'elixir', 15000, 1, 12, 2],
      ['Point Flag', 'elixir', 15000, 1, 12, 2],
      ['Ancient Skull', 'gold', 500000, 1, 30, 2],
      ['Statue of P.E.K.K.A', 'gold', 1000000, 1, 75, 2],
      ['Pirate Flag', 'gems', 500, 1, 1, 2],
      ['Mighty Statue', 'gems', 500, 1, 1, 2],
      ['Mighty Hero Statue', 'gems', 500, 1, 1, 2],
    ]);
    expect(DECORATION_TEXTS).toEqual({
      shopTab: 'Decorations',
      stash: 'Stash',
      stashTitle: 'Stash Decoration?',
      stashText: '<item> will be moved to the Shop and can be placed again at no cost.',
    });
    for (const d of catalog.decorations)
      expect(pngSize(d.art.path)).toEqual([d.art.width, d.art.height]);
  });

  it('buys a decoration, places it on the outer edge and refuses past its limit', () => {
    const m = village();
    m.beginDecoration('torch');
    expect(m.decorationPlacement).toBe('torch');
    // The edge outside the building area takes decorations, not buildings.
    expect(m.canPlace('cannon', 0, 0)).toBe(false);
    expect(m.placeDecoration(0, 0)).toBe(true);
    expect(m.state.elixir).toBe(2_000_000 - 500);
    const torch = m.decorations[0];
    expect(torch).toEqual({ id: 100, kind: 'torch', x: 0, y: 0 });
    expect(m.selectedDecoration).toBe(torch);
    expect(m.selected).toBeNull();
    // Out of the map, or over another decoration, a building or an obstacle: refused.
    m.beginDecoration('torch');
    expect(m.placeDecoration(MAP_SIZE - 1, 4)).toBe(false);
    expect(m.placeDecoration(1, 1)).toBe(false);
    expect(m.placeDecoration(19, 19)).toBe(false);
    m.state.obstacles = [{ id: 7, kind: 'pine-tree', x: 10, y: 4 }];
    expect(m.placeDecoration(11, 5)).toBe(false);
    expect(m.placeDecoration(2, 0)).toBe(true);
    for (const x of [4, 6]) {
      m.beginDecoration('torch');
      m.placeDecoration(x, 0);
    }
    expect(m.decorationCount('torch')).toBe(4);
    const elixir = m.state.elixir;
    m.beginDecoration('torch');
    expect(m.decorationPlacement).toBeNull();
    expect(m.state.elixir).toBe(elixir);
    // A building cannot be placed or dragged onto one.
    expect(m.canPlace('cannon', 3, 0)).toBe(false);
    expect(validateSave(JSON.parse(JSON.stringify(m.state)))).toBe(true);
  });

  it('asks for the experience level the Shop names and pays gems for the gem statues', () => {
    const m = village();
    m.beginDecoration('white-flag');
    expect(m.decorationPlacement).toBeNull();
    m.state.xp = xpFor(5);
    m.beginDecoration('white-flag');
    expect(m.placeDecoration(10, 10)).toBe(true);
    m.beginDecoration('bk-statue');
    expect(m.placeDecoration(12, 10)).toBe(true);
    expect(m.state.gems).toBe(500);
    expect(m.state.elixir).toBe(2_000_000 - 5000);
  });

  it('moves a decoration, stashes it for free placement and keeps the limit across both', () => {
    const m = village();
    m.beginDecoration('skull-flag');
    m.placeDecoration(10, 10);
    const flag = m.decorations[0];
    m.moveDecoration(flag.id);
    // Moving onto its own old tiles is allowed.
    expect(m.placeDecoration(11, 10)).toBe(true);
    expect([flag.x, flag.y]).toEqual([11, 10]);
    expect(m.state.gems).toBe(500);
    expect(m.stashDecoration(flag.id)).toBe(true);
    expect(m.decorations).toEqual([]);
    expect(m.stashedDecorations).toEqual({ 'skull-flag': 1 });
    expect(m.decorationCount('skull-flag')).toBe(1);
    expect(validateSave(JSON.parse(JSON.stringify(m.state)))).toBe(true);
    // Placing it again costs nothing, even without the gems to buy another.
    m.state.gems = 0;
    m.beginDecoration('skull-flag');
    expect(m.placeDecoration(4, 4)).toBe(true);
    expect(m.stashedDecorations).toEqual({});
    expect(m.state.gems).toBe(0);
    m.beginDecoration('skull-flag');
    expect(m.decorationPlacement).toBeNull();
  });

  it('rejects saves with unknown, overlapping, misplaced or over-limit decorations', () => {
    const m = village();
    const save = () => JSON.parse(JSON.stringify(m.state));
    m.state.decorations = [{ id: 200, kind: 'torch', x: 0, y: 0 }];
    expect(validateSave(save())).toBe(true);
    m.state.decorations = [{ id: 200, kind: 'statue', x: 0, y: 0 }];
    expect(validateSave(save())).toBe(false);
    m.state.decorations = [
      { id: 200, kind: 'torch', x: 0, y: 0 },
      { id: 201, kind: 'torch', x: 1, y: 1 },
    ];
    expect(validateSave(save())).toBe(false);
    m.state.decorations = [{ id: 200, kind: 'torch', x: 21, y: 21 }];
    expect(validateSave(save())).toBe(false);
    m.state.decorations = [{ id: 200, kind: 'torch', x: MAP_SIZE - 1, y: 0 }];
    expect(validateSave(save())).toBe(false);
    m.state.decorations = [{ id: 200, kind: 'white-flag', x: 0, y: 0 }];
    m.state.stashedDecorations = { 'white-flag': 1 };
    expect(validateSave(save())).toBe(false);
    m.state.decorations = [];
    m.state.stashedDecorations = { torch: 0 };
    expect(validateSave(save())).toBe(false);
  });

  it('keeps the obstacles an older save is given off its decorations', () => {
    const m = village();
    // The starting village's first Pine Tree stands at (2, 2).
    m.state.decorations = [{ id: 300, kind: 'torch', x: 2, y: 2 }];
    const save = JSON.parse(JSON.stringify(m.state));
    delete save.obstacles;
    delete save.obstacleGrowth;
    const loaded = new GameModel(save);
    expect(loaded.obstacles.length).toBeGreaterThan(0);
    expect(loaded.obstacles.some((o) => o.x === 2 && o.y === 2)).toBe(false);
    expect(validateSave(JSON.parse(JSON.stringify(loaded.state)))).toBe(true);
  });

  it('keeps regrowth off decorations', () => {
    const m = village();
    m.state.buildings = [];
    m.state.decorations = [];
    // Decorations fill every 2×2 site but one; that one is the only place a tree may grow.
    for (let x = 0; x < MAP_SIZE; x += 2)
      for (let y = 0; y < MAP_SIZE; y += 2)
        if (x || y) m.state.decorations.push({ id: m.state.nextId++, kind: 'torch', x, y });
    const sites = treeGrowthSites(
      [],
      [],
      2,
      m.decorations.map((d) => ({ ...d, size: 2 })),
    );
    expect(sites).toEqual([]);
    const growth = m.state.obstacleGrowth!;
    growth.nextAt = m.clock + 1;
    m.tick(m.clock + 10 * OBSTACLE_GROWTH_INTERVAL);
    expect(m.obstacles.filter((o) => o.kind !== 'bonus-gembox')).toEqual([]);
  });

  it('sends decorations a restored layout covers back to the Shop', () => {
    const m = village();
    m.beginEdit();
    m.saveLayout(0);
    m.dragTo(2, 4, 4);
    m.endEdit();
    m.beginDecoration('torch');
    m.placeDecoration(30, 30);
    expect(m.decorations).toHaveLength(1);
    m.beginEdit();
    m.loadLayout(0);
    expect(m.state.buildings.find((b) => b.id === 2)).toMatchObject({ x: 30, y: 30 });
    expect(m.decorations).toEqual([]);
    expect(m.stashedDecorations).toEqual({ torch: 1 });
    expect(validateSave(JSON.parse(JSON.stringify(m.state)))).toBe(true);
  });

  it('keeps a moved wall row off decorations', () => {
    const m = village();
    m.state.buildings.push(
      ...[2, 3, 4].map((x) => makeBuilding(m.state.nextId++, 'wall', x, 2, 1)),
    );
    m.beginDecoration('torch');
    m.placeDecoration(10, 3);
    m.selected = m.state.buildings.find((b) => b.kind === 'wall' && b.x === 3)!.id;
    m.selectWallRow();
    expect(m.beginWallMove()).toBe(true);
    m.previewWallMove(11, 3);
    expect(m.wallPlacementIssue).toBe('Move the row onto clear ground.');
    m.previewWallMove(11, 8);
    expect(m.wallPlacementIssue).toBeNull();
  });
});
