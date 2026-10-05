import { describe, expect, it } from 'vitest';
import catalog from '../reference/helpers/catalog.json' with { type: 'json' };
import { GameModel, makeBuilding } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { upgradeSeconds } from '../src/game/data';
import {
  HELPER_COOLDOWN_SECONDS,
  advanceHelper,
  helperLevels,
  helperReady,
  helperWorking,
  startHelperJob,
  validHelpers,
  type HelperState,
} from '../src/game/helpers';
import { validateSave } from '../src/game/save';

const HOUR = 3_600_000;

/** A bare timer, the way the model hands one to a helper. */
function timer(end: number) {
  const t = {
    end,
    move(ms: number) {
      t.end -= ms;
    },
  };
  return t;
}

function village(townhall = 10) {
  const m = new GameModel();
  m.state.obstacles = [];
  m.state.buildings = [
    makeBuilding(1, 'townhall', 20, 20, townhall),
    makeBuilding(2, 'builder', 30, 30),
    makeBuilding(3, 'builder', 34, 30),
    makeBuilding(4, 'helperhut', 10, 10),
    makeBuilding(5, 'cannon', 14, 10, 12),
    makeBuilding(6, 'laboratory', 10, 26, 8),
  ];
  m.state.nextId = 7;
  m.state.gold = m.state.elixir = 30_000_000;
  m.state.dark = 400_000;
  m.state.gems = 10_000;
  m.state.army = emptyArmy();
  m.state.spells = emptySpells();
  m.tick(m.clock);
  return m;
}

describe('helper tables', () => {
  it('reads the client rows for both helpers', () => {
    expect(HELPER_COOLDOWN_SECONDS).toBe(82_800);
    const builder = helperLevels('builder');
    expect(builder.map((l) => l.multiplier)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(builder.map((l) => l.townHall)).toEqual([10, 10, 11, 11, 12, 12, 13, 14]);
    expect(builder[0]).toEqual({ level: 1, townHall: 10, multiplier: 1, seconds: 3600, cost: 500 });
    const lab = helperLevels('lab');
    expect(lab).toHaveLength(12);
    expect(lab[0]).toMatchObject({ townHall: 9, multiplier: 1, cost: 0 });
    expect(lab[11]).toMatchObject({ townHall: 16, multiplier: 12, cost: 1000 });
    expect(catalog.helpers.map((h) => h.id)).toEqual(['builder', 'lab', 'alchemist', 'prospector']);
  });
});

describe('helper work', () => {
  it('runs a job (1 + level)× for one hour, then rests until a day after it began', () => {
    const h: HelperState = { level: 4 };
    const t = timer(10 * HOUR);
    startHelperJob('builder', h, { building: 1, level: 1 }, 0);
    expect(helperWorking('builder', h)).toBe(true);
    advanceHelper('builder', h, HOUR / 2, () => t);
    expect(t.end).toBe(8 * HOUR);
    expect(advanceHelper('builder', h, 2 * HOUR, () => t)).toBe('state');
    expect(t.end).toBe(6 * HOUR);
    expect(h.saved).toBe(4 * 3600);
    expect(h.job).toBeUndefined();
    expect(helperReady(h, 24 * HOUR - 1)).toBe(false);
    expect(advanceHelper('builder', h, 24 * HOUR, () => t)).toBe('ready');
    expect(helperReady(h, 24 * HOUR)).toBe(true);
  });

  it('stops when the job finishes inside the hour', () => {
    const h: HelperState = { level: 1 };
    const t = timer(30 * 60_000);
    startHelperJob('builder', h, { building: 1, level: 1 }, 0);
    advanceHelper('builder', h, HOUR, () => t);
    // Twice as fast: the 30 minutes left take 15.
    expect(t.end).toBe(15 * 60_000);
    expect(h.saved).toBe(15 * 60);
    expect(h.job).toBeUndefined();
    expect(h.readyAt).toBe(24 * HOUR);
  });

  it('applies an absence exactly as it applies second-by-second ticks', () => {
    for (const remaining of [20 * 60_000, 5 * HOUR]) {
      const a: HelperState = { level: 3 },
        b: HelperState = { level: 3 };
      const ta = timer(remaining),
        tb = timer(remaining);
      startHelperJob('builder', a, { building: 1, level: 1 }, 0);
      startHelperJob('builder', b, { building: 1, level: 1 }, 0);
      for (let now = 1000; now <= 2 * HOUR; now += 1000)
        if (tb.end > now) advanceHelper('builder', b, now, () => tb);
      advanceHelper('builder', a, 2 * HOUR, () => ta);
      expect(Math.abs(ta.end - tb.end)).toBeLessThanOrEqual(1);
    }
  });

  it('returns to a recurring job each day, offline included, until it completes', () => {
    const h: HelperState = { level: 8 };
    const t = timer(100 * HOUR);
    startHelperJob('builder', h, { building: 1, level: 1 }, 0, true);
    advanceHelper('builder', h, 49 * HOUR, () => t);
    // Three working hours (days 0, 1 and 2) at 8 extra hours each.
    expect(t.end).toBe(76 * HOUR);
    expect(h.job).toMatchObject({ start: 48 * HOUR, repeat: true });
    expect(h.readyAt).toBe(72 * HOUR);
    // The job completes on day 3 (it needs 4 hours at 9×, but has only 76 - 72 = 4 left).
    advanceHelper('builder', h, 100 * HOUR, () => (t.end > 72 * HOUR ? t : undefined));
    expect(t.end).toBe(72 * HOUR + Math.ceil((4 * HOUR) / 9));
    expect(h.job).toBeUndefined();
  });

  it('drops a job whose timer has gone', () => {
    const h: HelperState = { level: 2 };
    startHelperJob('lab', h, { research: 'archer', level: 3 }, 0, true);
    expect(advanceHelper('lab', h, 60_000, () => undefined)).toBe('state');
    expect(h.job).toBeUndefined();
    expect(h.readyAt).toBe(24 * HOUR);
  });
});

describe('Helper Hut in the village', () => {
  it('is a free, instant Town Hall 9 building with one level', () => {
    const m = village(9);
    expect(m.helperHut).toBeDefined();
    expect(m.buyHelper('builder')).toBe(false); // Town Hall 10.
    const gems = m.state.gems;
    expect(m.buyHelper('lab')).toBe(true);
    expect(m.state.gems).toBe(gems); // The first Lab Assistant level is free.
    expect(m.helper('lab')).toEqual({ level: 1 });
  });

  it('speeds up a building upgrade and keeps its completion XP', () => {
    const m = village();
    expect(m.buyHelper('builder')).toBe(true);
    expect(m.state.gems).toBe(10_000 - 500);
    const cannon = m.state.buildings.find((b) => b.kind === 'cannon')!;
    m.upgrade(cannon.id);
    const seconds = upgradeSeconds('cannon', 12);
    expect(cannon.upgradeEnd).toBe(m.clock + seconds * 1000);
    const end = cannon.upgradeEnd!;
    const jobs = m.helperJobs('builder');
    expect(jobs.map((j) => j.name)).toEqual(['Cannon']);
    expect(m.assignHelper('builder', jobs[0].target)).toBe(true);
    expect(m.buyHelper('builder')).toBe(false); // Not while he works.
    m.tick(m.clock + 2 * HOUR);
    expect(cannon.upgradeEnd).toBe(end - HOUR);
    expect(m.helper('builder')!.job).toBeUndefined();
    expect(m.assignHelper('builder', jobs[0].target)).toBe(false); // Resting.
    const xp = m.state.xp;
    m.tick(cannon.upgradeEnd!);
    expect(cannon.level).toBe(13);
    expect(m.state.xp).toBe(xp + Math.floor(Math.sqrt(seconds)));
  });

  it('lets the Lab Assistant speed up research only', () => {
    const m = village();
    m.buyHelper('lab');
    expect(m.helperJobs('lab')).toEqual([]);
    m.state.research = { kind: 'archer', end: m.clock + 10 * HOUR };
    const [job] = m.helperJobs('lab');
    expect(job.target).toEqual({ research: 'archer', level: m.researchLevel('archer') });
    expect(m.assignHelper('lab', job.target)).toBe(true);
    m.tick(m.clock + HOUR);
    expect(m.state.research.end).toBe(m.clock + 8 * HOUR);
  });

  it('saves and validates helper state', () => {
    const m = village();
    m.buyHelper('builder');
    const cannon = m.state.buildings.find((b) => b.kind === 'cannon')!;
    m.upgrade(cannon.id);
    m.assignHelper('builder', m.helperJobs('builder')[0].target, true);
    m.tick(m.clock + 60_000);
    const saved = JSON.parse(JSON.stringify(m.state));
    expect(validateSave(saved)).toBe(true);
    for (const bad of [
      { builder: { level: 9 } },
      { builder: { level: 1, job: { target: { building: 1 }, start: 0, applied: 0 } } },
      { builder: { level: 1, job: { target: { building: 1, level: 1 }, start: 0, applied: 0 } } },
      { alchemist: { level: 1 } },
    ])
      expect(validHelpers(bad)).toBe(false);
    expect(validateSave({ ...saved, helpers: { lab: { level: 0 } } })).toBe(false);
  });
});
