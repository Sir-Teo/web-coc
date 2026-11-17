import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { startHelperJob, type HelperState } from '../src/game/helpers';

const HOUR = 3_600_000;
const START = 1_000_000;
function overlap() {
  const m = new GameModel();
  m.state.lastTick = START;
  const mine = makeBuilding(9000, 'goldmine', 30, 30, 11);
  mine.upgradeStart = START;
  mine.upgradeEnd = START + 7 * HOUR;
  mine.stored = 0;
  m.state.buildings = [mine];
  m.state.helpers = { builder: { level: 4 } };
  startHelperJob('builder', m.state.helpers.builder!, { building: mine.id, level: 11 }, START);
  m.state.boosts = { builders: { start: START, end: START + HOUR, applied: START } };
  return m;
}

it('adds potion and Apprentice rates until the actual completion instant', () => {
  const m = overlap();
  m.tick(START + HOUR);
  const mine = m.state.buildings[0];
  // Seven hours of work at 1 + 9 + 4 = 14x finishes after half an hour.
  expect(mine.level).toBe(12);
  expect(mine.stored).toBe(2100); // 30 minutes at the pinned 4,200/hour rate.
  expect(m.state.helpers!.builder!.saved).toBe(7200); // Four extra seconds per second.
  expect(m.state.helpers!.builder!.job).toBeUndefined();
});

it('makes offline and frequent updates agree on completion and post-upgrade income', () => {
  const offline = overlap(),
    frequent = overlap();
  for (let minute = 1; minute <= 60; minute++) frequent.tick(START + minute * 60_000);
  offline.tick(START + HOUR);
  expect(offline.state.buildings[0].stored).toBeCloseTo(frequent.state.buildings[0].stored, 8);
  expect(offline.state.helpers).toEqual(frequent.state.helpers);
  expect(offline.state.xp).toBe(frequent.state.xp);
});

it('restores a partially advanced shared job without awarding progress twice', () => {
  const original = overlap();
  original.tick(START + HOUR / 4);
  const saved = JSON.parse(JSON.stringify(original.state));
  const restored = new GameModel(saved, START + HOUR);
  const again = new GameModel(JSON.parse(JSON.stringify(restored.state)), START + HOUR);
  expect(restored.state.buildings[0].stored).toBe(2100);
  expect(restored.state.helpers!.builder!.saved).toBe(7200);
  expect(again.state.buildings[0].stored).toBe(2100);
  expect(again.state.helpers).toEqual(restored.state.helpers);
});

it('applies the potion once to other buildings and hero upgrades too', () => {
  const m = overlap();
  const cannon = makeBuilding(9001, 'cannon', 10, 10, 1);
  Object.assign(cannon, { upgradeStart: START, upgradeEnd: START + 20 * HOUR });
  m.state.buildings.push(cannon);
  m.state.king = { level: 1, upgradeStart: START, upgradeEnd: START + 20 * HOUR };
  m.tick(START + HOUR);
  expect(cannon.upgradeEnd).toBe(START + 11 * HOUR);
  expect(m.state.king.upgradeEnd).toBe(START + 11 * HOUR);
});

it('shares a hero timer without applying the Builder Potion a second time', () => {
  const m = overlap();
  const mine = m.state.buildings[0];
  m.state.king = { level: 1, upgradeStart: START, upgradeEnd: START + 7 * HOUR };
  startHelperJob('builder', m.state.helpers!.builder!, { hero: 'king', level: 1 }, START);
  m.tick(START + HOUR / 4);
  expect(m.state.king.upgradeEnd).toBe(START + (15 * HOUR) / 4);
  // The unhelped mine gets only the potion's nine extra seconds per second.
  expect(mine.upgradeEnd).toBe(START + (19 * HOUR) / 4);
  m.tick(START + HOUR / 2);
  expect(m.state.king.level).toBe(2);
  expect(mine.level).toBe(11);
  expect(m.state.helpers!.builder!.saved).toBe(7200);
});

it('combines a Research Potion with the Lab Assistant and preserves other potion families', () => {
  const m = overlap();
  delete m.state.helpers!.builder;
  delete m.state.boosts!.builders;
  const h: HelperState = (m.state.helpers!.lab = { level: 4 });
  m.state.research = { kind: 'archer', end: START + 14 * HOUR };
  startHelperJob('lab', h, { research: 'archer', level: m.researchLevel('archer') }, START);
  m.state.boosts!.laboratory = { start: START, end: START + HOUR, applied: START };
  m.tick(START + HOUR / 4);
  expect(m.state.research!.end).toBe(START + (29 * HOUR) / 4);
  m.tick(START + HOUR / 2);
  expect(m.state.research).toBeUndefined();
  expect(m.troopLevel('archer')).toBe(2);
  expect(h.saved).toBe(7200);
});
