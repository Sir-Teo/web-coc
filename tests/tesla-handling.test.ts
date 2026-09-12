import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type FX } from '../src/game/model';
import { teslaHandlingCue, teslaHandlingPoses } from '../src/game/tesla-effect-poses';

function village() {
  const m = new GameModel();
  m.state.obstacles = [];
  m.state.buildings = [
    makeBuilding(1, 'townhall', 20, 20, 8),
    makeBuilding(2, 'builder', 26, 26),
    makeBuilding(3, 'tesla', 6, 10, 6),
  ];
  m.state.nextId = 4;
  m.state.gold = 1000000;
  const events: FX[] = [];
  m.onEffect = (event) => events.push(event);
  return { m, events };
}

it('emits one pickup and one valid drop, retaining the tower on failed placement or cancel', () => {
  const { m, events } = village();
  m.move(3);
  m.move(3);
  expect(events).toEqual([{ type: 'tesla-pickup', sourceId: 3, x: 7, y: 11 }]);
  expect(m.place(20, 20)).toBe(false);
  expect(events).toHaveLength(1);
  expect(m.place(10, 10)).toBe(true);
  expect(events[1]).toEqual({ type: 'tesla-place', sourceId: 3, x: 11, y: 11 });
  expect(m.place(12, 12)).toBe(false);
  expect(events).toHaveLength(2);
  m.move(3);
  m.cancel();
  expect(events.slice(-2).map((e) => e.type)).toEqual(['tesla-pickup', 'tesla-cancel']);
  expect(m.state.buildings.find((b) => b.id === 3)).toMatchObject({ x: 10, y: 10 });
});

it('new Tesla construction emits only its successful placement and cannot replay the purchase', () => {
  const { m, events } = village();
  m.beginBuild('tesla');
  expect(events).toEqual([]);
  expect(m.place(20, 20)).toBe(false);
  expect(events).toEqual([]);
  expect(m.place(10, 10)).toBe(true);
  expect(events).toEqual([{ type: 'tesla-place', sourceId: 4, x: 11, y: 11 }]);
  expect(m.state.buildings.find((b) => b.id === 4)?.constructing).toBe(true);
  expect(m.place(12, 12)).toBe(false);
  expect(events).toHaveLength(1);
});

it('one edit gesture has one pickup/drop pair and preserves its single undo step', () => {
  const { m, events } = village();
  m.beginEdit();
  m.beginDrag();
  expect(m.dragTo(3, 20, 20)).toBe(false);
  expect(m.dragTo(3, 6, 10)).toBe(true);
  expect(events).toEqual([]);
  for (const x of [7, 8, 9, 10]) expect(m.dragTo(3, x, 10)).toBe(true);
  m.endDrag();
  m.endDrag();
  expect(events).toEqual([
    { type: 'tesla-pickup', sourceId: 3, x: 7, y: 11 },
    { type: 'tesla-place', sourceId: 3, x: 11, y: 11 },
  ]);
  m.undo();
  expect(m.state.buildings.find((b) => b.id === 3)).toMatchObject({ x: 6, y: 10 });
  expect(m.canUndo).toBe(false);
  m.redo();
  expect(m.state.buildings.find((b) => b.id === 3)).toMatchObject({ x: 10, y: 10 });
  expect(events).toHaveLength(2);
});

it('cancelled gestures clear the pickup without a drop and battle commands cannot move home buildings', () => {
  const { m, events } = village();
  m.beginEdit();
  m.beginDrag();
  m.dragTo(3, 7, 10);
  m.endDrag(true);
  expect(events.map((e) => e.type)).toEqual(['tesla-pickup', 'tesla-cancel']);
  const home = structuredClone(m.state.buildings);
  m.startBattle(0, true);
  m.move(3);
  m.editing = true;
  expect(m.dragTo(3, 9, 10)).toBe(false);
  expect(m.state.buildings).toEqual(home);
  expect(events).toHaveLength(2);
});

it('replaces a held Tesla without emitting spurious effects for another building', () => {
  const { m, events } = village();
  m.move(3);
  m.move(2);
  expect(events.map((e) => e.type)).toEqual(['tesla-pickup', 'tesla-cancel']);
  m.place(10, 10);
  expect(events).toHaveLength(2);
});

it('uses original pickup/drop samples at 80% volume, normal pitch and three grass pieces', () => {
  const ground = { x: 100, y: 200 };
  for (const [kind, file] of [
    ['pickup', 'tesla_pickup_11'],
    ['place', 'tesla_drop_09'],
  ] as const) {
    expect(teslaHandlingCue(3, 9, kind, 10)).toEqual({
      key: 'tesla:home:3:9',
      sample: `tesla-${file}`,
      at: 10,
      volume: 0.8,
      pitch: 1,
    });
    const poses = teslaHandlingPoses(3, 9, kind, 10, 10.14, ground);
    expect(poses).toHaveLength(3);
    expect(teslaHandlingPoses(3, 9, kind, 10, 11, ground)).toEqual([]);
    expect(teslaHandlingPoses(3, 9, kind, 10, 10.14, ground)).toEqual(poses);
  }
});
