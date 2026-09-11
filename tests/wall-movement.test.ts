import { describe, it, expect } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { wallDestinations } from '../src/game/wall-movement';
import { validateSave } from '../src/game/save';

function village(edit = false) {
  const m = new GameModel();
  m.townhall!.level = 8;
  m.state.obstacles = [];
  m.state.buildings = m.state.buildings.filter((b) => b.kind !== 'wall');
  const walls = [2, 3, 4].map((x, i) => makeBuilding(m.state.nextId++, 'wall', x, 2, i + 2));
  m.state.buildings.push(...walls);
  if (edit) m.beginEdit();
  m.selected = walls[1].id;
  m.selectWallRow();
  return { m, walls };
}

describe('wall row movement', () => {
  it('rotates mixed-level identities around the anchor and returns exactly after four turns', () => {
    const { m, walls } = village();
    expect(m.beginWallMove()).toBe(true);
    const original = walls.map(({ id, x, y }) => ({ id, x, y }));
    m.previewWallMove(5, 22);
    m.rotateWallMove();
    expect(m.wallPreview).toEqual(walls.map((b, i) => ({ id: b.id, x: 5, y: 21 + i })));
    for (let i = 0; i < 3; i++) m.rotateWallMove();
    m.previewWallMove(3, 2);
    expect(wallDestinations(m.wallMove!)).toEqual(original);
    expect(walls.map(({ id, x, y }) => ({ id, x, y }))).toEqual(original);
  });
  it('moves through its own old footprint without resources, builders, IDs or levels changing', () => {
    const { m, walls } = village();
    for (const b of m.state.buildings.filter((b) => b.kind === 'builder'))
      b.upgradeEnd = m.clock + 60000;
    const before = structuredClone(m.state);
    m.beginWallMove();
    m.previewWallMove(4, 2);
    expect(m.wallPlacementIssue).toBeNull();
    expect(m.confirmWallMove()).toBe(true);
    expect(m.wallMove).toBeNull();
    expect(m.wallAxis).toBe('x');
    expect(m.selectedWalls).toHaveLength(3);
    for (const w of walls)
      expect(w).toEqual({ ...before.buildings.find((b) => b.id === w.id), x: w.x });
    expect(walls.map((b) => b.x)).toEqual([3, 4, 5]);
    expect(m.state.gold).toBe(before.gold);
    expect(m.state.nextId).toBe(before.nextId);
  });
  it('rejects the entire row when one piece hits an obstacle, building or boundary', () => {
    const { m } = village();
    m.beginWallMove();
    const before = JSON.stringify(m.state);
    for (const [x, y] of [
      [2, 2],
      [45, 2],
      [3, 1],
      [3, 46],
      [m.townhall!.x, m.townhall!.y],
    ]) {
      m.previewWallMove(x, y);
      expect(m.confirmWallMove()).toBe(false);
      expect(JSON.stringify(m.state)).toBe(before);
    }
    m.previewWallMove(5, 22);
    m.state.obstacles!.push({ id: 999, kind: 'trees', x: 6, y: 22 });
    const withTree = JSON.stringify(m.state);
    expect(m.wallPlacementIssue).toContain('trees');
    expect(m.confirmWallMove()).toBe(false);
    expect(JSON.stringify(m.state)).toBe(withTree);
    expect(m.previewWallMove(NaN, 4)).toBe(false);
    expect(m.previewWallMove(4.5, 4)).toBe(false);
  });
  it('keeps a preview out of the save and discards it on cancel, selection or activity changes', () => {
    const { m, walls } = village();
    const original = structuredClone(walls);
    m.beginWallMove();
    m.previewWallMove(5, 22);
    m.rotateWallMove();
    const save = JSON.parse(JSON.stringify(m.state));
    expect(validateSave(save)).toBe(true);
    const restored = new GameModel(save);
    expect(restored.wallMove).toBeNull();
    expect(restored.state.buildings.filter((b) => walls.some((w) => w.id === b.id))).toEqual(
      original,
    );
    m.cancel();
    expect(m.wallMove).toBeNull();
    expect(walls).toEqual(original);
    m.selected = walls[1].id;
    m.selectWallRow();
    m.beginWallMove();
    m.selected = m.townhall!.id;
    expect(m.wallMove).toBeNull();
    m.selected = walls[1].id;
    m.selectWallRow();
    m.beginWallMove();
    m.beginEdit();
    expect(m.wallMove).toBeNull();
  });
  it('records one edit history entry for a translated and rotated row and restores every piece', () => {
    const { m, walls } = village(true);
    const before = structuredClone(walls);
    m.beginWallMove();
    for (let x = 3; x <= 5; x++) m.previewWallMove(x, 22);
    m.rotateWallMove();
    expect(m.canUndo).toBe(false);
    expect(m.confirmWallMove()).toBe(true);
    expect(m.wallAxis).toBe('y');
    const after = structuredClone(walls);
    m.undo();
    expect(walls).toEqual(before);
    expect(m.canUndo).toBe(false);
    expect(m.wallAxis).toBeNull();
    expect(m.selectedWalls).toHaveLength(1);
    m.redo();
    expect(walls).toEqual(after);
    expect(m.canRedo).toBe(false);
    expect(validateSave(JSON.parse(JSON.stringify(m.state)))).toBe(true);
  });
  it('does not create an undo entry when a row stays in place', () => {
    const { m } = village(true);
    m.beginWallMove();
    for (let i = 0; i < 4; i++) m.rotateWallMove();
    expect(m.confirmWallMove()).toBe(true);
    expect(m.canUndo).toBe(false);
  });
  it('revalidates stale IDs and old coordinates before committing and blocks battle mutations', () => {
    const { m, walls } = village();
    m.beginWallMove();
    m.previewWallMove(5, 22);
    walls[0].x = 7;
    expect(m.wallPlacementIssue).toContain('changed');
    expect(m.confirmWallMove()).toBe(false);
    walls[0].x = 2;
    m.state.buildings = m.state.buildings.filter((b) => b.id !== walls[0].id);
    expect(m.confirmWallMove()).toBe(false);
    m.state.buildings.push(walls[0]);
    m.startBattle(0, true);
    expect(m.wallMove).toBeNull();
    expect(m.beginWallMove()).toBe(false);
    expect(m.previewWallMove(5, 22)).toBe(false);
    expect(m.rotateWallMove()).toBe(false);
    expect(m.confirmWallMove()).toBe(false);
  });
  it('does not treat arbitrary same-level bulk selections as a movable row', () => {
    const { m, walls } = village();
    m.selectSingleWall();
    expect(m.adjustWallSelection(1)).toBe(false); // Other pieces have different levels.
    expect(m.beginWallMove()).toBe(false);
    walls[0].level = walls[1].level;
    m.adjustWallSelection(1);
    expect(m.selectedWalls).toHaveLength(2);
    expect(m.beginWallMove()).toBe(false);
  });
  it('keeps undo and redo atomic when a newly placed wall occupies a historical tile', () => {
    const { m, walls } = village(true);
    m.beginWallMove();
    m.previewWallMove(5, 22);
    m.rotateWallMove();
    m.confirmWallMove();
    const oldSite = makeBuilding(m.state.nextId++, 'wall', 2, 2);
    m.state.buildings.push(oldSite);
    const before = JSON.stringify(m.state);
    m.undo();
    expect(JSON.stringify(m.state)).toBe(before);
    expect(m.canUndo).toBe(true);
    m.state.buildings = m.state.buildings.filter((b) => b.id !== oldSite.id);
    m.undo();
    expect(walls.map((b) => b.y)).toEqual([2, 2, 2]);
    const newSite = makeBuilding(m.state.nextId++, 'wall', 5, 21);
    m.state.buildings.push(newSite);
    const afterUndo = JSON.stringify(m.state);
    m.redo();
    expect(JSON.stringify(m.state)).toBe(afterUndo);
    expect(m.canRedo).toBe(true);
    m.state.buildings = m.state.buildings.filter((b) => b.id !== newSite.id);
    m.redo();
    expect(walls.map((b) => b.y)).toEqual([21, 22, 23]);
  });
  it('does not partially restore a saved row layout through a newly built wall', () => {
    const { m, walls } = village(true);
    m.saveLayout(0);
    m.beginWallMove();
    m.previewWallMove(5, 22);
    m.rotateWallMove();
    m.confirmWallMove();
    const added = makeBuilding(m.state.nextId++, 'wall', 2, 2);
    m.state.buildings.push(added);
    const before = JSON.stringify(m.state);
    m.loadLayout(0);
    expect(JSON.stringify(m.state)).toBe(before);
    m.state.buildings = m.state.buildings.filter((b) => b.id !== added.id);
    m.loadLayout(0);
    expect(walls.map((b) => b.y)).toEqual([2, 2, 2]);
  });
});
