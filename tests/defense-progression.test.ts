import { describe, it, expect } from 'vitest';
import { BUILDINGS, buildingHp, maxCountFor, upgradeCost, upgradeSeconds } from '../src/game/data';
import { GameModel, initialSave, makeBuilding } from '../src/game/model';
import { validateSave } from '../src/game/save';

const expected = {
  cannon: {
    costs: [250, 1000, 4000, 16000, 50000, 100000, 150000, 240000, 360000, 500000],
    seconds: [10, 120, 600, 2700, 3600, 7200, 14400, 21600, 28800, 36000],
    hp: [420, 470, 520, 570, 620, 670, 730, 800, 880, 960],
    counts: [1, 2, 2, 2, 3, 3, 5, 5],
  },
  mortar: {
    costs: [5000, 25000, 100000, 200000, 300000, 560000],
    seconds: [7200, 10800, 14400, 21600, 43200, 64800],
    hp: [400, 450, 500, 550, 600, 650],
    counts: [0, 0, 1, 1, 1, 2, 3, 4],
  },
  archertower: {
    costs: [1000, 2000, 5000, 20000, 80000, 150000, 300000, 480000, 580000, 760000],
    seconds: [60, 900, 2700, 10800, 14400, 18000, 21600, 28800, 36000, 43200],
    hp: [380, 420, 460, 500, 540, 580, 630, 690, 750, 810],
    counts: [0, 1, 1, 2, 3, 3, 4, 5],
  },
};

describe.each(['cannon', 'archertower', 'mortar'] as const)(
  '%s construction progression',
  (kind) => {
    const values = expected[kind];

    it('uses destination prices and timers, retaining current health until each upgrade completes', () => {
      const m = new GameModel();
      m.townhall!.level = 8;
      const b =
        m.state.buildings.find((b) => b.kind === kind) ??
        makeBuilding(m.state.nextId++, kind, 2, 2);
      if (!m.state.buildings.includes(b)) m.state.buildings.push(b);
      b.level = 1;
      b.hp = b.maxHp = values.hp[0];
      for (let level = 1; level < values.hp.length; level++) {
        expect(upgradeCost(kind, level)).toBe(values.costs[level]);
        expect(upgradeSeconds(kind, level)).toBe(values.seconds[level]);
        m.state.gold = values.costs[level] - 1;
        m.upgrade(b.id);
        expect(b.upgradeEnd).toBeUndefined();
        m.state.gold++;
        const start = m.clock;
        m.upgrade(b.id);
        expect(m.state.gold).toBe(0);
        expect(m.busy).toBe(1);
        expect(b.upgradeStart).toBe(start);
        expect(b.upgradeEnd).toBe(start + values.seconds[level] * 1000);
        m.tick(b.upgradeEnd! - 1);
        expect(b.level).toBe(level);
        expect(b.hp).toBe(values.hp[level - 1]);
        m.tick(m.clock + 1);
        expect(b.level).toBe(level + 1);
        expect([b.hp, b.maxHp, buildingHp(kind, b.level)]).toEqual(Array(3).fill(values.hp[level]));
        expect(m.busy).toBe(0);
      }
      m.state.gold = 2000000;
      m.upgrade(b.id);
      expect(b.upgradeEnd).toBeUndefined();
      expect(m.state.gold).toBe(2000000);
    });

    it('builds the first level with its own price, duration, hitpoints and builder reservation', () => {
      const m = new GameModel();
      m.state.obstacles = [];
      m.state.buildings = m.state.buildings.filter((b) => b.kind !== kind);
      m.townhall!.level = 3;
      expect(BUILDINGS[kind].cost).toBe(values.costs[0]);
      expect(BUILDINGS[kind].build).toBe(values.seconds[0]);
      m.state.gold = values.costs[0];
      m.beginBuild(kind);
      expect(m.place(2, 2)).toBe(true);
      const b = m.state.buildings.at(-1)!;
      expect(m.state.gold).toBe(0);
      expect(b.upgradeEnd).toBe(m.clock + values.seconds[0] * 1000);
      expect(b.constructing).toBe(true);
      expect(b.hp).toBe(values.hp[0]);
      expect(m.busy).toBe(1);
      m.tick(b.upgradeEnd!);
      expect(b.constructing).toBe(false);
      expect(b.level).toBe(1);
      expect(m.busy).toBe(0);
      expect(validateSave(m.state)).toBe(true);
    });

    it('enforces each Town Hall count and preserves grandfathered pieces', () => {
      expect(Array.from({ length: 8 }, (_, i) => maxCountFor(kind, i + 1))).toEqual(values.counts);
      const m = new GameModel();
      expect(m.countOf(kind)).toBe(values.counts[1]);
      m.beginBuild(kind);
      expect(m.placement).toBeNull();
      const extra = makeBuilding(m.state.nextId++, kind, 2, 2, BUILDINGS[kind].maxLevel);
      m.state.obstacles = [];
      m.state.buildings.push(extra);
      const restored = new GameModel(structuredClone(m.state));
      expect(restored.state.buildings.find((b) => b.id === extra.id)).toMatchObject({
        x: 2,
        y: 2,
        level: BUILDINGS[kind].maxLevel,
      });
      restored.placement = kind;
      expect(restored.place(4, 2)).toBe(false);
      expect(validateSave(restored.state)).toBe(true);
    });

    it('normalizes old health without restarting a pending timer or changing its paid cost', () => {
      const save = initialSave();
      const b =
        save.buildings.find((b) => b.kind === kind) ?? makeBuilding(save.nextId++, kind, 2, 2);
      if (!save.buildings.includes(b)) save.buildings.push(b);
      b.level = 2;
      b.maxHp = 2000;
      b.hp = 1000;
      b.upgradeStart = Date.now();
      b.upgradeEnd = b.upgradeStart + 900000;
      const end = b.upgradeEnd,
        gold = save.gold;
      const m = new GameModel(save);
      expect([b.hp, b.maxHp]).toEqual([values.hp[1] / 2, values.hp[1]]);
      expect(b.upgradeEnd).toBe(end);
      expect(m.state.gold).toBe(gold);
      m.tick(end);
      expect([b.level, b.hp, b.maxHp]).toEqual([3, values.hp[2], values.hp[2]]);
      expect(m.state.gold).toBe(gold);
      m.tick(end + 1000);
      expect(b.level).toBe(3);
    });
  },
);
