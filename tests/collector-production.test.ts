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
