import { expect, it } from 'vitest';
import source from '../reference/full-client/progression.json';
import { buildingHp, upgradeCost, upgradeSeconds } from '../src/game/data';
import { GameModel, makeBuilding } from '../src/game/model';

it('uses every pinned Dark Barracks and Dark Spell Factory destination row', () => {
  for (const kind of ['darkbarracks', 'darkspellfactory'] as const) {
    for (const row of source.buildings[kind].levels) {
      expect(buildingHp(kind, row.level), `${kind} ${row.level} HP`).toBe(row.hp);
      if (row.level > 1) {
        expect(upgradeCost(kind, row.level - 1), `${kind} ${row.level} price`).toBe(row.cost);
        expect(upgradeSeconds(kind, row.level - 1), `${kind} ${row.level} duration`).toBe(
          row.seconds,
        );
      }
    }
  }
});

it('charges 600,000 elixir and schedules a full day for Dark Barracks level two', () => {
  const m = new GameModel();
  m.townhall!.level = 18;
  const facility = makeBuilding(9000, 'darkbarracks', 30, 30, 1);
  m.state.buildings.push(facility);
  m.state.elixir = 600_000;
  m.upgrade(facility.id);
  expect(m.state.elixir).toBe(0);
  expect(facility.upgradeEnd).toBe(m.clock + 86_400_000);
});

it('normalizes saved home health while preserving damage fraction and paid deadlines', () => {
  const m = new GameModel();
  const b = makeBuilding(9000, 'darkbarracks', 30, 30, 2);
  b.maxHp = 625;
  b.hp = 312.5;
  b.upgradeEnd = m.clock + 12345;
  b.upgradeStart = m.clock - 5000;
  m.state.buildings.push(b);
  const restored = new GameModel(JSON.parse(JSON.stringify(m.state)), m.clock);
  const own = restored.state.buildings.find((b) => b.id === 9000)!;
  expect(own.maxHp).toBe(550);
  expect(own.hp).toBe(275);
  expect(own.upgradeEnd).toBe(b.upgradeEnd);
});

it('keeps historical battle snapshots intact while home health adopts native values', () => {
  const m = new GameModel();
  const facility = makeBuilding(9000, 'darkbarracks', 30, 30, 2);
  facility.hp = facility.maxHp = 625;
  m.state.buildings.push(facility);
  m.startBattle(0, true);
  m.activeTroop = 'archer';
  expect(m.deploy(1, 13)).toBe(true);
  for (let i = 0; i < 200; i++) m.step(0.05);
  m.finishBattle();
  const expected = structuredClone(m.battle);
  const record = m.state.raidLog![0];
  const restored = new GameModel(JSON.parse(JSON.stringify(m.state)));
  expect(restored.state.buildings.find((b) => b.id === 9000)!.maxHp).toBe(550);
  expect(restored.startReplay(record.id)).toBe(true);
  for (let i = 0; i < 1000 && !restored.replay!.complete; i++) restored.step(0.05);
  expect(restored.battle).toEqual(expected);
});
