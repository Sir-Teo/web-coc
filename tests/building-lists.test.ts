import { expect, it } from 'vitest';
import { buildingsOfKind, nonWallBuildings } from '../src/game/building-lists';
import { GameModel, makeBuilding } from '../src/game/model';

it('retains family order and live tower state, including fallen towers that need cleanup', () => {
  const m = new GameModel();
  m.startBattle(0, true);
  const b = m.battle!;
  const first = makeBuilding(20, 'inferno', 10, 10, 1);
  const last = makeBuilding(10, 'inferno', 20, 20, 1);
  b.buildings = [first, makeBuilding(30, 'wall', 15, 15, 1), last];
  const towers = buildingsOfKind(b, 'inferno');
  expect(towers).toEqual([first, last]);
  first.hp = 0;
  last.infernoMode = 'multi';
  expect(buildingsOfKind(b, 'inferno')).toBe(towers);
  expect(towers[0].hp).toBe(0);
  expect(towers[1].infernoMode).toBe('multi');
  expect(nonWallBuildings(b)).toEqual([first, last]);
});

it('rebuilds family lists for replacement layouts and appended buildings without retaining another battle', () => {
  const m = new GameModel();
  m.startBattle(0, true);
  const b = m.battle!;
  const first = makeBuilding(1, 'tesla', 10, 10, 1);
  b.buildings = [first];
  expect(buildingsOfKind(b, 'tesla')).toEqual([first]);
  expect(buildingsOfKind(b, 'airsweeper')).toEqual([]);
  const sweeper = makeBuilding(2, 'airsweeper', 20, 20, 1);
  b.buildings.push(sweeper);
  expect(buildingsOfKind(b, 'airsweeper')).toEqual([sweeper]);
  const replacement = makeBuilding(1, 'inferno', 30, 30, 1);
  b.buildings = [replacement];
  expect(buildingsOfKind(b, 'tesla')).toEqual([]);
  expect(buildingsOfKind(b, 'inferno')).toEqual([replacement]);
  expect(nonWallBuildings(b)).toEqual([replacement]);
  const other = { ...b, buildings: [first] };
  expect(buildingsOfKind(other, 'inferno')).toEqual([]);
  expect(buildingsOfKind(other, 'tesla')).toEqual([first]);
});
