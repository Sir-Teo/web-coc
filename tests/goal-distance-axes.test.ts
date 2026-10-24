import { expect, it } from 'vitest';
import { GoalDistanceAxes } from '../src/game/goal-distance-axes';

it('measures squared offsets from subtile centers to the rectangle edges', () => {
  const axes = new GoalDistanceAxes(96, 2).get(10, 12, 3);
  expect(axes.x.length).toBe(96);
  expect(axes.y.length).toBe(96);
  expect(axes.x[0]).toBe(95.0625); // 9.75 tiles left of the rectangle.
  expect(axes.x[20]).toBe(0);
  expect(axes.x[25]).toBe(0);
  expect(axes.x[26]).toBe(0.0625);
  expect(axes.y[23]).toBe(0.0625);
  expect(axes.y[24]).toBe(0);
  expect(axes.y[30]).toBe(0.0625);
});

it('keeps distinct exact coordinates and sizes, including fractional goals', () => {
  const cache = new GoalDistanceAxes(96, 2);
  const original = cache.get(10, 12, 3);
  expect(cache.get(10, 12, 3)).toBe(original);
  expect(cache.get(10.5, 12, 3).x[20]).toBe(0.0625);
  expect(cache.get(10, 12.5, 3).y[24]).toBe(0.0625);
  expect(cache.get(10, 12, 2).x[26]).toBe(1.5625);
  expect(cache.get(10 + Number.EPSILON * 8, 12, 3)).not.toBe(original);
  expect(original.x[26]).toBe(0.0625);
});

it('evicts the least recently requested goal without modifying retained arrays', () => {
  const cache = new GoalDistanceAxes(96, 2, 2);
  const a = cache.get(10, 12, 3),
    b = cache.get(15, 16, 2);
  expect(cache.get(10, 12, 3)).toBe(a);
  cache.get(25, 26, 4);
  expect(cache.get(10, 12, 3)).toBe(a);
  expect(cache.get(15, 16, 2)).not.toBe(b);
  expect(b.x[0]).toBe(217.5625);
});

it('bounds the normal cache to 64 goals and releases it at a battle reset', () => {
  const cache = new GoalDistanceAxes(96, 2);
  const first = cache.get(0, 0, 1);
  for (let x = 1; x <= 64; x++) cache.get(x, 0, 1);
  const loadedAgain = cache.get(0, 0, 1);
  expect(loadedAgain).not.toBe(first);
  expect(loadedAgain).toEqual(first);
  cache.clear();
  expect(cache.get(0, 0, 1)).not.toBe(loadedAgain);
});

it('keeps different grid resolutions independent', () => {
  const tiles = new GoalDistanceAxes(4, 1).get(1, 1, 1);
  const subtiles = new GoalDistanceAxes(8, 2).get(1, 1, 1);
  expect(tiles.x[0]).toBe(0.25);
  expect(subtiles.x[0]).toBe(0.5625);
});
