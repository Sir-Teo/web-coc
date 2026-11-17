import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';

const START = 1_000_000;
const HOUR = 3_600_000;
function village() {
  const model = new GameModel();
  model.state.lastTick = START;
  model.state.buildings = [makeBuilding(9000, 'goldmine', 30, 30, 12)];
  model.state.buildings[0].stored = 0;
  return model;
}

it('does not produce the same elapsed hour twice after a backward clock correction', () => {
  const m = village();
  m.tick(START + HOUR);
  expect(m.state.buildings[0].stored).toBe(4200);
  m.tick(START + HOUR / 2);
  m.tick(START + HOUR);
  expect(m.state.buildings[0].stored).toBe(4200);
  m.tick(START + 2 * HOUR);
  expect(m.state.buildings[0].stored).toBe(8400);
});

it('keeps a saved future watermark during reload and resumes only after it is passed', () => {
  const m = village();
  m.tick(START + HOUR);
  const saved = JSON.parse(JSON.stringify(m.state));
  const restored = new GameModel(saved, START + HOUR / 2);
  expect(restored.clock).toBe(START + HOUR);
  restored.tick(START + HOUR);
  expect(restored.state.buildings[0].stored).toBe(4200);
  restored.tick(START + 2 * HOUR);
  expect(restored.state.buildings[0].stored).toBe(8400);
});

it('does not resurrect expired boosts or repeat their productive interval', () => {
  const m = village();
  m.state.boosts = { resources: { start: START, end: START + HOUR, applied: START } };
  m.tick(START + 2 * HOUR);
  expect(m.state.buildings[0].stored).toBe(12_600);
  expect(m.state.boosts.resources).toBeUndefined();
  m.tick(START + HOUR / 2);
  m.tick(START + 2 * HOUR);
  expect(m.state.buildings[0].stored).toBe(12_600);
  m.tick(START + 3 * HOUR);
  expect(m.state.buildings[0].stored).toBe(16_800);
});

it('keeps completed upgrades, earned XP and post-completion income across a rollback', () => {
  const m = village();
  const mine = m.state.buildings[0];
  mine.level = 11;
  mine.upgradeStart = START;
  mine.upgradeEnd = START + HOUR / 2;
  m.tick(START + HOUR);
  const xp = m.state.xp;
  expect(mine.level).toBe(12);
  expect(mine.stored).toBe(2100);
  m.tick(START + HOUR / 4);
  m.tick(START + HOUR);
  expect(mine.level).toBe(12);
  expect(mine.stored).toBe(2100);
  expect(m.state.xp).toBe(xp);
});

it('matches an independent ledger of covered minutes across all three collector families', () => {
  let cases = 0;
  for (const [kind, level, hourly, capacity] of [
    ['goldmine', 12, 4200, 200000],
    ['collector', 12, 4200, 200000],
    ['darkdrill', 11, 200, 4600],
  ] as const) {
    const m = village();
    m.state.buildings = [makeBuilding(9000, kind, 30, 30, level)];
    const covered = new Set<number>();
    for (let i = 0; i < 128; i++) {
      const minute = (i * 137 + (i % 7) * 211) % 1080;
      // An interval already covered owns no new minutes, regardless of arrival order.
      for (let t = 1; t <= minute; t++) covered.add(t);
      m.tick(START + minute * 60_000);
      expect(m.state.buildings[0].stored).toBeCloseTo(
        Math.min(capacity, (covered.size * hourly) / 60),
        7,
      );
      cases++;
    }
    m.tick(START + 200 * HOUR);
    expect(m.state.buildings[0].stored).toBe(capacity);
  }
  expect(cases).toBe(384);
});

it('starts a fresh village at its injected clock without inheriting a wall-time watermark', () => {
  const model = new GameModel(undefined, START);
  expect(model.clock).toBe(START);
  expect(model.state.lastTick).toBe(START);
  model.state.buildings = [makeBuilding(9000, 'goldmine', 30, 30, 12)];
  model.tick(START + HOUR);
  expect(model.state.buildings[0].stored).toBe(4200);
});
