import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Effect } from '../src/game/model';
import { darkDrillHandlingCues } from '../src/game/dark-drill-sounds';
it('uses the original handling samples, volume, pitch and event identity', () => {
  const events = [
    { id: 1, index: 1, kind: 'pickup' as const, at: 10, x: 2, y: 3 },
    { id: 1, index: 2, kind: 'place' as const, at: 10.5, x: 5, y: 6 },
  ];
  expect(darkDrillHandlingCues(events)).toEqual([
    {
      key: 'dark-drill:handling:1:1',
      sample: 'dark-drill-dark_drill_pickup_02.ogg',
      at: 10,
      volume: 0.7,
      pitch: 1,
    },
    {
      key: 'dark-drill:handling:1:2',
      sample: 'dark-drill-dark_drill_place_07.ogg',
      at: 10.5,
      volume: 0.7,
      pitch: 1,
    },
  ]);
});
it('emits pickup, successful placement and cancellation without sounding rejected moves', () => {
  const model = new GameModel();
  model.state.obstacles = [];
  const b = makeBuilding(999, 'darkdrill', 2, 2);
  model.state.buildings.push(b);
  const events: Effect[] = [];
  model.onEffect = (e) => events.push(e);
  model.move(b.id);
  expect(model.place(0, 0)).toBe(false);
  expect(events.map((e) => e.type)).toEqual(['darkdrill-pickup']);
  expect(model.place(35, 35)).toBe(true);
  model.move(b.id);
  model.cancel();
  expect(events.map((e) => e.type)).toEqual([
    'darkdrill-pickup',
    'darkdrill-place',
    'darkdrill-pickup',
    'darkdrill-cancel',
  ]);
  expect(events[1]).toMatchObject({ sourceId: 999, x: 36.5, y: 36.5 });
});
