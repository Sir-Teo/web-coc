import { makeBuilding, type Building } from '../../src/game/model';
import { nativeBuildings } from '../../src/game/native-campaign';
import { isTrap } from '../../src/game/data';
import { findSubtilePath, resetSubtileGrids } from '../../src/game/subtile-path';

/** Original route witness: dense layouts, fractional starts, melee/ranged goals, and cache churn. */
export function subtileRouteWitness(consume: (route: readonly { x: number; y: number }[]) => void) {
  let count = 0;
  const record = (
    start: { x: number; y: number },
    target: Building | { x: number; y: number },
    buildings: Building[],
    range: number,
  ) => {
    consume(findSubtilePath(start, target, buildings, range));
    count++;
  };
  resetSubtileGrids();
  for (const stage of [0, 33, 61, 85]) {
    const buildings = nativeBuildings(stage);
    const targets = buildings
      .filter((b) => b.kind !== 'wall' && !isTrap(b.kind))
      .filter((_, i) => i % 6 === 0)
      .slice(0, 32);
    for (const target of targets)
      for (const [x, y] of [
        [1.25, 1.25],
        [46.75, 46.75],
        [1.25, 23.75],
        [23.75, 1.25],
        [23.25, 23.75],
      ])
        for (const range of [0.4, 1, 3]) record({ x, y }, target, buildings, range);
  }
  const obstacles = [
    makeBuilding(8000, 'cannon', 10, 10, 1),
    makeBuilding(8001, 'wall', 15, 15, 1),
  ];
  const goal = makeBuilding(9000, 'goldstorage', 20, 20, 1);
  record({ x: 5.25, y: 20.25 }, goal, obstacles, 0.4);
  obstacles[0].hp = 0;
  record({ x: 5.25, y: 20.25 }, goal, obstacles, 0.4);
  for (const [x, y, kind] of [
    [20.5, 20, 'goldstorage'],
    [20.5, 20.5, 'goldstorage'],
    [20.5, 20.5, 'wall'],
  ] as const) {
    Object.assign(goal, { x, y, kind });
    record({ x: 5.25, y: 20.25 }, goal, obstacles, 0.4);
    record({ x: 5.25, y: 20.25 }, { x, y }, obstacles, 0.4);
  }
  for (let i = 0; i < 80; i++)
    record(
      { x: 1.25, y: 45.25 },
      makeBuilding(9100 + i, 'goldmine', (i % 10) * 4 + 3, Math.floor(i / 10) * 5 + 3, 1),
      obstacles,
      0.4,
    );
  record({ x: 1.75, y: 45.25 }, makeBuilding(9100, 'goldmine', 3, 3, 1), obstacles, 0.4);
  const target = makeBuilding(9200, 'goldmine', 30, 30, 1);
  record({ x: 1.25, y: 1.25 }, target, obstacles, 1);
  resetSubtileGrids();
  record({ x: 1.25, y: 1.25 }, target, obstacles, 1);
  return count;
}

/** Captured before the melee distance guard: cell edges, fractional goals and short ranges. */
export function subtileMeleeBoundaryWitness(
  consume: (route: readonly { x: number; y: number }[]) => void,
) {
  resetSubtileGrids();
  let count = 0;
  for (const offset of [0, 0.1, 0.25, 0.499999999]) {
    const goal = makeBuilding(9000, 'goldstorage', 10 + offset, 10 + offset, 1);
    for (const target of [goal, { x: 10 + offset, y: 10 + offset }])
      for (const range of [-1, 0, 1e-7, 0.249999999, 0.25, 0.4, 0.499999999, 0.5])
        for (const [x, y] of [
          [9.25, 9.25],
          [9.75, 9.75],
          [10.25, 9.75],
          [10.25, 10.25],
          [13.25, 13.25],
          [13.75, 13.75],
          [14.25, 13.75],
          [16.25, 9.25],
        ]) {
          consume(findSubtilePath({ x, y }, target, [], range));
          count++;
        }
  }
  return count;
}
