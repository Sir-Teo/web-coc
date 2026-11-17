import { expect, it } from 'vitest';
import { advanceBoostedHelper } from '../src/game/helper-potion-timing';
import { advanceBoost, type Boost } from '../src/game/magic-items';
import { advanceHelper, startHelperJob, type HelperState } from '../src/game/helpers';

const MINUTE = 60_000,
  HOUR = 60 * MINUTE;
function timer(end: number) {
  return {
    end,
    move(ms: number) {
      this.end -= ms;
    },
  };
}

// Independent work-budget oracle: consume the original work, rather than repeatedly
// pulling back a deadline. Windows here contain one assignment and one potion.
function workBudget(
  work: number,
  helperStart: number,
  potionStart: number,
  helperRate: number,
  potionRate: number,
  now: number,
) {
  let remaining = work,
    extra = 0,
    helperSaved = 0;
  const boundaries = [
    ...new Set(
      [0, helperStart, helperStart + HOUR, potionStart, potionStart + HOUR, now].filter(
        (t) => t <= now,
      ),
    ),
  ].sort((a, b) => a - b);
  for (let i = 1; i < boundaries.length; i++) {
    const from = boundaries[i - 1],
      until = boundaries[i];
    const h = from >= helperStart && from < helperStart + HOUR ? helperRate : 0;
    const p = from >= potionStart && from < potionStart + HOUR ? potionRate : 0;
    const rate = 1 + h + p,
      span = until - from;
    if (remaining <= span * rate) {
      const exact = remaining / rate;
      return { end: from + Math.ceil(exact), helperSaved: (helperSaved + h * exact) / 1000 };
    }
    remaining -= span * rate;
    extra += span * (h + p);
    helperSaved += span * h;
  }
  return { end: work - extra, helperSaved: helperSaved / 1000 };
}

it('matches an independent work-budget oracle across source levels and staggered windows', () => {
  let cases = 0;
  for (const kind of ['builder', 'lab'] as const) {
    const potion = kind === 'builder' ? 10 : 24;
    for (const level of kind === 'builder' ? [1, 4, 8] : [1, 6, 12])
      for (const minutes of [7, 30, 60, 420, 1020, 1800, 2400])
        for (const helperMinute of [0, 30, 90])
          for (const potionMinute of [0, 15, 75]) {
            const h: HelperState = { level },
              t = timer(minutes * MINUTE);
            startHelperJob(kind, h, { building: 1, level: 1 }, helperMinute * MINUTE);
            const boost: Boost = {
              start: potionMinute * MINUTE,
              end: potionMinute * MINUTE + HOUR,
              applied: potionMinute * MINUTE,
            };
            advanceBoostedHelper(kind, h, boost, potion, 3 * HOUR, () => t);
            const expected = workBudget(
              minutes * MINUTE,
              helperMinute * MINUTE,
              potionMinute * MINUTE,
              level,
              potion - 1,
              3 * HOUR,
            );
            expect(t.end).toBe(expected.end);
            // Completion rounds to a millisecond; saved-time attribution can differ by less than that.
            expect(Math.abs((h.saved ?? 0) - expected.helperSaved)).toBeLessThanOrEqual(0.001);
            cases++;
          }
  }
  expect(cases).toBe(378);
});

it.each([60, 300, 400])(
  'preserves recurring work/rest boundaries through potion expiry (%i hours of work)',
  (hours) => {
    const create = () => {
      const h: HelperState = { level: 8 },
        t = timer(hours * HOUR);
      startHelperJob('builder', h, { building: 1, level: 1 }, 0, true);
      const b: Boost = { start: 0, end: 26 * HOUR, applied: 0 };
      return { h, t, b };
    };
    const offline = create(),
      split = create();
    advanceBoostedHelper('builder', offline.h, offline.b, 10, 49 * HOUR, () => offline.t);
    for (let minute = 1; minute <= 49 * 60; minute++) {
      const at = minute * MINUTE;
      if (split.h.job && Math.min(at, split.b.end) > split.b.applied)
        advanceBoostedHelper('builder', split.h, split.b, 10, at, () => split.t);
      else advanceHelper('builder', split.h, at, () => split.t);
      // Only the shared timer is excluded from the separate potion pass.
      advanceBoost(split.b, 10, [], at);
    }
    expect(offline.t.end).toBe(split.t.end);
    expect(offline.h).toEqual(split.h);
    if (hours === 400) {
      expect(offline.t.end).toBe(142 * HOUR);
      expect(offline.h.saved).toBe(24 * 3600);
      expect(offline.h.job).toMatchObject({ start: 48 * HOUR, repeat: true });
    } else {
      expect(offline.h.job).toBeUndefined();
      if (hours === 300) {
        expect(offline.t.end).toBe(48 * HOUR + Math.ceil((2 * HOUR) / 9));
        expect(offline.h.saved).toBe(64_000);
      }
    }
  },
);
