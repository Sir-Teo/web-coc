import { describe, expect, it } from 'vitest';
import { collectorProduction, produceCollector } from '../src/game/collector-production';
import { GameModel, makeBuilding } from '../src/game/model';

describe('collector production', () => {
  it('never loses income across an upgrade', () => {
    for (const kind of ['goldmine', 'collector', 'darkdrill'] as const) {
      const max = kind === 'darkdrill' ? 11 : 17;
      for (let level = 1; level < max; level++) {
        const now = collectorProduction(kind, level),
          next = collectorProduction(kind, level + 1);
        expect(next.perHour, `${kind} ${level}`).toBeGreaterThanOrEqual(now.perHour);
        expect(next.capacity, `${kind} ${level}`).toBeGreaterThanOrEqual(now.capacity);
      }
    }
  });

  it('reads the same table on both sides of level 12', () => {
    expect(collectorProduction('goldmine', 12)).toEqual({ perHour: 4200, capacity: 200000 });
    expect(collectorProduction('goldmine', 13)).toEqual({ perHour: 4900, capacity: 250000 });
    expect(collectorProduction('collector', 2)).toEqual({ perHour: 400, capacity: 2000 });
  });

  it('keeps legacy overflow until it is collected', () => {
    // A prototype-era level-2 mine could hold 20,000; the native cap is 2,000.
    expect(produceCollector('goldmine', 2, 20000, 3600)).toBe(20000);
    expect(produceCollector('goldmine', 2, 0, 3600)).toBe(400);
    expect(produceCollector('goldmine', 2, 1900, 3600)).toBe(2000);
  });

  it('a level 13 mine produces more than a level 12 one in the simulation', () => {
    const rates = [12, 13].map((level) => {
      const m = new GameModel();
      const mine = makeBuilding(9000, 'goldmine', 30, 30, level);
      mine.stored = 0;
      m.state.buildings.push(mine);
      m.tick(m.clock + 3600_000);
      return mine.stored;
    });
    expect(rates[1]).toBeGreaterThan(rates[0]);
  });
});

const HOUR = 3_600_000;
const START = 1_000_000;
function offlineCollector(kind: 'goldmine' | 'collector', level = 12) {
  const model = new GameModel();
  model.state.lastTick = START;
  model.state.buildings = [makeBuilding(9000, kind, 30, 30, level)];
  return model;
}

it.each(['goldmine', 'collector'] as const)(
  '%s credits a long absence like hourly updates, up to its actual storage capacity',
  (kind) => {
    const offline = offlineCollector(kind),
      hourly = offlineCollector(kind);
    for (let hour = 1; hour <= 24; hour++) hourly.tick(START + hour * HOUR);
    offline.tick(START + 24 * HOUR);
    // Pinned level 12: 4,200/hour, 200,000 internal capacity (not eight hours).
    expect(offline.state.buildings[0].stored).toBe(100_800);
    expect(offline.state.buildings[0].stored).toBe(hourly.state.buildings[0].stored);
    offline.tick(START + 48 * HOUR);
    expect(offline.state.buildings[0].stored).toBe(200_000);
    offline.tick(START + 72 * HOUR);
    expect(offline.state.buildings[0].stored).toBe(200_000);
  },
);

it.each(['goldmine', 'collector'] as const)(
  '%s accounts for only the expired Resource Potion overlap after an offline upgrade',
  (kind) => {
    const offline = offlineCollector(kind, 11),
      hourly = offlineCollector(kind, 11);
    for (const model of [offline, hourly]) {
      const building = model.state.buildings[0];
      building.upgradeEnd = START + 12 * HOUR;
      model.state.boosts = { resources: { start: START, end: START + 24 * HOUR, applied: 0 } };
    }
    for (let hour = 1; hour <= 30; hour++) hourly.tick(START + hour * HOUR);
    offline.tick(START + 30 * HOUR);
    const building = offline.state.buildings[0];
    expect(building.level).toBe(12);
    // 18 productive hours after completion, plus 12 hours at double production.
    expect(building.stored).toBe(126_000);
    expect(building.stored).toBe(hourly.state.buildings[0].stored);
    expect(offline.state.boosts?.resources).toBeUndefined();
  },
);

it.each(['goldmine', 'collector'] as const)(
  '%s restores all elapsed production once from JSON and keeps preexisting overflow',
  (kind) => {
    const original = offlineCollector(kind),
      state = JSON.parse(JSON.stringify(original.state));
    const restored = new GameModel(state, START + 24 * HOUR);
    expect(restored.state.buildings[0].stored).toBe(100_800);
    const again = new GameModel(JSON.parse(JSON.stringify(restored.state)), START + 24 * HOUR);
    expect(again.state.buildings[0].stored).toBe(100_800);
    again.state.buildings[0].stored = 250_000;
    again.tick(START + 48 * HOUR);
    expect(again.state.buildings[0].stored).toBe(250_000);
    again.state.buildings[0].stored = 0;
    again.tick(START + 72 * HOUR);
    expect(again.state.buildings[0].stored).toBe(100_800);
  },
);
