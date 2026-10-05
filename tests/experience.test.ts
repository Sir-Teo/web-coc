import { describe, it, expect } from 'vitest';
import catalog from '../reference/experience/catalog.json' with { type: 'json' };
import { fundedVillage } from './fixtures/funded-village';
import { chiefProgress, completionXp, MAX_CHIEF_LEVEL } from '../src/game/experience';
import { upgradeSeconds } from '../src/game/data';

describe('chief experience', () => {
  it('follows the client curve: 30 XP to level 2, then 50 more per level', () => {
    expect(catalog.levels.slice(0, 4).map((l) => l.points)).toEqual([30, 50, 100, 150]);
    expect(chiefProgress(0)).toEqual({ level: 1, into: 0, needed: 30 });
    expect(chiefProgress(29)).toEqual({ level: 1, into: 29, needed: 30 });
    expect(chiefProgress(30)).toEqual({ level: 2, into: 0, needed: 50 });
    expect(chiefProgress(1850)).toEqual({ level: 10, into: 20, needed: 450 });
    expect(chiefProgress(-5).level).toBe(1);
    expect(chiefProgress(Number.NaN).level).toBe(1);
  });

  it('stops at the last client level', () => {
    const total = catalog.levels.slice(0, -1).reduce((n, l) => n + l.points, 0);
    expect(MAX_CHIEF_LEVEL).toBe(catalog.levels.length);
    expect(chiefProgress(total - 1).level).toBe(MAX_CHIEF_LEVEL - 1);
    expect(chiefProgress(total)).toEqual({ level: MAX_CHIEF_LEVEL, into: 0, needed: 0 });
    expect(chiefProgress(total * 10).level).toBe(MAX_CHIEF_LEVEL);
  });

  it('pays the whole square root of a build in seconds', () => {
    expect(completionXp(0, 60_000)).toBe(7);
    expect(completionXp(0, 14 * 86_400_000)).toBe(1099);
    expect(completionXp(0, 20 * 86_400_000)).toBe(1314);
    expect(completionXp(5_000, 5_000)).toBe(0);
    expect(completionXp(undefined, 60_000)).toBe(0);
  });

  it('grants build XP when an upgrade completes, even one finished early with gems', () => {
    for (const early of [false, true]) {
      const m = fundedVillage();
      m.state.gems = 1_000_000;
      const b = m.state.buildings.find((v) => v.kind === 'cannon')!;
      const seconds = upgradeSeconds(b.kind, b.level);
      expect(seconds).toBeGreaterThan(0);
      const xp = m.state.xp;
      m.upgrade(b.id);
      expect(b.upgradeEnd).toBe(m.clock + seconds * 1000);
      if (early) {
        m.tick(m.clock + (seconds * 1000) / 2);
        m.finish(b.id);
      } else m.tick(b.upgradeEnd!);
      expect(b.upgradeEnd).toBeUndefined();
      expect(m.state.xp).toBe(xp + Math.floor(Math.sqrt(seconds)));
    }
  });

  it('gives nothing for instant walls or laboratory research', () => {
    const m = fundedVillage();
    const wall = m.state.buildings.find((v) => v.kind === 'wall');
    const xp = m.state.xp;
    if (wall) {
      m.upgrade(wall.id);
      m.tick(m.clock + 1000);
      expect(m.state.xp).toBe(xp);
    }
    m.state.research = { kind: 'archer', end: m.clock + 1000 };
    m.tick(m.clock + 2000);
    expect(m.state.research).toBeUndefined();
    expect(m.state.xp).toBe(xp);
  });

  it('announces each chief level reached', () => {
    const m = fundedVillage();
    const toasts: string[] = [];
    m.onToast = (message) => toasts.push(message);
    const { level, into, needed } = m.chiefProgress;
    const b = m.state.buildings.find((v) => v.kind === 'cannon')!;
    m.state.xp += needed - into - 1;
    m.upgrade(b.id);
    m.tick(b.upgradeEnd!);
    expect(m.chiefLevel).toBe(level + 1);
    expect(toasts).toContain(`Chief level ${level + 1}!`);
    expect(toasts.some((t) => /^Cannon is ready! \+\d+ XP$/.test(t))).toBe(true);
  });

  it('pays one point per Town Hall level destroyed in a raid, and nothing in practice', () => {
    for (const [practice, destroyHall] of [
      [false, true],
      [false, false],
      [true, true],
    ] as const) {
      const m = fundedVillage();
      m.startBattle(0, practice);
      const hall = m.battle!.buildings.find((v) => v.kind === 'townhall')!;
      if (destroyHall) hall.hp = 0;
      const xp = m.state.xp;
      m.finishBattle();
      expect(m.state.xp).toBe(xp + (destroyHall && !practice ? hall.level : 0));
    }
  });
});
