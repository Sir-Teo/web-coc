import { expect, it } from 'vitest';
import { BUILDINGS, upgradeCost, upgradeSeconds } from '../src/game/data';
import { GameModel } from '../src/game/model';

it('uses original purchase and destination-level construction prices and times', () => {
  expect([
    BUILDINGS.darkdrill.cost,
    ...Array.from({ length: 10 }, (_, i) => upgradeCost('darkdrill', i + 1)),
  ]).toEqual([
    180000, 270000, 540000, 900000, 1200000, 1800000, 2100000, 2400000, 3700000, 5300000, 12000000,
  ]);
  expect([
    BUILDINGS.darkdrill.build,
    ...Array.from({ length: 10 }, (_, i) => upgradeSeconds('darkdrill', i + 1)),
  ]).toEqual([14400, 21600, 43200, 64800, 86400, 129600, 151200, 172800, 216000, 259200, 518400]);
});
it('charges once and preserves the original construction deadline after reload', () => {
  const m = new GameModel();
  m.townhall!.level = 7;
  m.state.obstacles = [];
  m.state.elixir = 1000000;
  m.placement = 'darkdrill';
  expect(m.place(2, 2)).toBe(true);
  const drill = m.state.buildings.at(-1)!;
  expect(m.state.elixir).toBe(820000);
  expect(drill.upgradeEnd! - drill.upgradeStart!).toBe(14400000);
  const restored = new GameModel(JSON.parse(JSON.stringify(m.state)));
  restored.tick(drill.upgradeEnd!);
  const built = restored.state.buildings.find((b) => b.id === drill.id)!;
  expect(built.constructing).toBe(false);
  expect(built.level).toBe(1);
  expect(built.stored).toBe(0);
  restored.upgrade(built.id);
  expect(restored.state.elixir).toBe(550000);
  expect(built.upgradeEnd! - built.upgradeStart!).toBe(21600000);
  restored.upgrade(built.id);
  expect(restored.state.elixir).toBe(550000);
});
