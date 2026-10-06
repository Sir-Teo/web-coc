import { describe, expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { validateSave } from '../src/game/save';
import {
  decodeLayout,
  encodeLayout,
  fitLayout,
  layoutFromLink,
  layoutLink,
} from '../src/game/layout-share';

function village(ids: number) {
  const m = new GameModel();
  m.state.obstacles = [];
  m.state.buildings = [
    makeBuilding(ids + 1, 'townhall', 20, 20, 3),
    makeBuilding(ids + 2, 'cannon', 10, 10, 1),
    makeBuilding(ids + 3, 'cannon', 14, 10, 1),
    makeBuilding(ids + 4, 'wall', 8, 8, 1),
    makeBuilding(ids + 5, 'wall', 9, 8, 1),
  ];
  m.state.nextId = ids + 6;
  return m;
}
const place = (m: GameModel) => m.state.buildings.map((b) => `${b.kind}@${b.x},${b.y}`).sort();

describe('layout sharing', () => {
  it('encodes places by kind and decodes them back', () => {
    const code = encodeLayout(5, [
      { kind: 'cannon', x: 10, y: 12 },
      { kind: 'wall', x: 47, y: 0 },
      { kind: 'cannon', x: 3, y: 4 },
    ]);
    expect(code).toBe('1.5.cannon:KMDE.wall:vA');
    expect(decodeLayout(code)).toEqual({
      townhall: 5,
      positions: {
        cannon: [
          { x: 10, y: 12 },
          { x: 3, y: 4 },
        ],
        wall: [{ x: 47, y: 0 }],
      },
    });
    for (const bad of [
      '',
      '2.5.cannon:KM',
      '1.x.cannon:KM',
      '1.5.dragonlair:KM',
      '1.5.cannon:K',
      '1.5.cannon:KM:x',
      // A 3×3 Cannon at 46 leaves the 48-tile field.
      '1.5.cannon:uK',
      // Two Cannons on the same tiles.
      '1.5.cannon:KMKM',
    ])
      expect(decodeLayout(bad), bad).toBeNull();
  });

  it('finds the code in a link, as the share produces it', () => {
    const link = layoutLink('https://example.test', '1.5.cannon:KM');
    expect(link).toBe('https://example.test/#layout=1.5.cannon%3AKM');
    expect(layoutFromLink(link)).toBe('1.5.cannon:KM');
    expect(layoutFromLink('https://example.test/?layout=1.2.wall:AB')).toBe('1.2.wall:AB');
    expect(layoutFromLink('https://example.test/')).toBeNull();
  });

  it('maps places onto a village by kind and sets the rest aside clear of obstacles', () => {
    const shared = decodeLayout('1.3.cannon:CCGC.wall:AA')!;
    const buildings = [
      { id: 7, kind: 'cannon' as const, x: 30, y: 30 },
      { id: 5, kind: 'cannon' as const, x: 34, y: 30 },
      { id: 9, kind: 'wall' as const, x: 0, y: 0 },
      { id: 10, kind: 'wall' as const, x: 1, y: 0 },
    ];
    // The tile the second wall would take first is blocked by an obstacle.
    const fitted = fitLayout(shared, buildings, (x, y) => x === 5 && y === 2)!;
    expect(fitted.setAside).toBe(1);
    const at = Object.fromEntries(fitted.slots.map((s) => [s.id, [s.x, s.y]]));
    // Lower ids take the first places of their kind.
    expect(at[5]).toEqual([2, 2]);
    expect(at[7]).toEqual([6, 2]);
    expect(at[9]).toEqual([0, 0]);
    // Set aside on the first free tile, past both Cannons and the obstacle.
    expect(at[10]).toEqual([9, 2]);
  });

  it('shares a saved layout from one village into another’s slot, restored with undo', () => {
    // The starter village with a Cannon and the Archer Tower (both 3×3) swapped, saved and shared.
    const a = new GameModel();
    const cannon = a.state.buildings.find((v) => v.kind === 'cannon')!,
      tower = a.state.buildings.find((v) => v.kind === 'archertower')!;
    [cannon.x, cannon.y, tower.x, tower.y] = [tower.x, tower.y, cannon.x, cannon.y];
    a.saveLayout(0);
    const code = a.layoutShareCode(0)!;
    expect(code.startsWith(`1.${a.townhallLevel}.`)).toBe(true);
    // Another village of the same buildings under other ids.
    const b = new GameModel();
    for (const v of b.state.buildings) v.id += 1000;
    b.state.nextId += 1000;
    const before = place(b);
    expect(b.importLayout(code, 1)).toBe(0);
    expect(b.layouts[1].slots).toHaveLength(b.state.buildings.length);
    expect(place(b)).toEqual(before);
    b.loadLayout(1);
    expect(place(b)).toEqual(place(a));
    b.undo();
    expect(place(b)).toEqual(before);
    expect(validateSave(JSON.parse(JSON.stringify(b.state)))).toBe(true);
    // A damaged code changes nothing.
    expect(b.importLayout('1.3.cannon:K', 2)).toBe(false);
    expect(b.layouts[2]?.slots ?? []).toHaveLength(0);
  });
});
