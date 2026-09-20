import { describe, expect, it } from 'vitest';
import { fundedVillage } from './fixtures/funded-village';
import {
  BUILDINGS,
  maxCountFor,
  maxLevelFor,
  trapDamage,
  trapStats,
  upgradeCost,
  upgradeSeconds,
  type TroopKind,
} from '../src/game/data';
import { GameModel, makeBuilding, type Unit } from '../src/game/model';
import { validateSave } from '../src/game/save';
import { stepTraps } from '../src/game/traps';

const expected = {
  bomb: {
    costs: [400, 1000, 10000, 40000, 100000, 230000, 330000, 500000],
    seconds: [0, 60, 300, 1800, 3600, 7200, 10800, 14400],
    damage: [20, 24, 29, 35, 42, 54, 72, 92],
    counts: [0, 0, 2, 2, 4, 4, 6, 6],
    cap: 5,
    unlock: 3,
  },
  giantbomb: {
    costs: [12500, 75000, 220000, 750000, 900000],
    seconds: [0, 3600, 10800, 14400, 36000],
    damage: [175, 200, 225, 250, 275],
    counts: [0, 0, 0, 0, 0, 1, 2, 3],
    cap: 3,
    unlock: 6,
  },
  airbomb: {
    costs: [4000, 20000, 75000, 300000, 550000, 800000],
    seconds: [0, 1800, 3600, 14400, 28800, 43200],
    damage: [100, 120, 144, 173, 208, 232],
    counts: [0, 0, 0, 0, 2, 2, 2, 4],
    cap: 3,
    unlock: 5,
  },
  springtrap: {
    costs: [2000, 130000, 240000, 350000, 800000],
    seconds: [0, 3600, 7200, 10800, 14400],
    damage: [0, 250, 300, 350, 400],
    counts: [0, 0, 0, 2, 2, 4, 4, 6],
    cap: 3,
    unlock: 4,
  },
} as const;
const kinds = ['bomb', 'giantbomb', 'airbomb', 'springtrap'] as const;

for (const kind of kinds)
  describe(`${kind} progression`, () => {
    const e = expected[kind];
    it('places instantly with every builder occupied but requires a builder for upgrades', () => {
      const m = new GameModel();
      m.townhall!.level = 8;
      m.state.obstacles = [];
      const busy = m.state.buildings.filter((b) => b.kind === 'cannon');
      for (const b of busy) {
        b.upgradeStart = m.clock;
        b.upgradeEnd = m.clock + 10000000;
      }
      expect(m.busy).toBe(m.builders);
      m.state.gold = e.costs[0] - 1;
      m.beginBuild(kind);
      expect(m.placement).toBeNull();
      m.state.gold++;
      m.beginBuild(kind);
      expect(m.place(2, 2)).toBe(true);
      const trap = m.state.buildings.at(-1)!;
      expect([m.state.gold, trap.level, trap.constructing, trap.upgradeEnd]).toEqual([
        0,
        1,
        undefined,
        undefined,
      ]);
      expect(m.busy).toBe(m.builders);
      m.state.gold = e.costs[1];
      m.upgrade(trap.id);
      expect(trap.upgradeEnd).toBeUndefined();
      expect(m.state.gold).toBe(e.costs[1]);
      expect(validateSave(m.state)).toBe(true);
      const restored = new GameModel(structuredClone(m.state));
      expect(restored.state.buildings.find((b) => b.id === trap.id)).toMatchObject({
        level: 1,
        x: 2,
        y: 2,
      });
    });
    it('charges each playable destination, retains paid timestamps after reload and completes exactly once', () => {
      let m = new GameModel();
      m.townhall!.level = 8;
      m.state.obstacles = [];
      const id = m.state.nextId++;
      m.state.buildings.push(makeBuilding(id, kind, 2, 2));
      for (let level = 1; level < e.cap; level++) {
        let b = m.state.buildings.find((b) => b.id === id)!;
        m.state.gold = e.costs[level] - 1;
        m.upgrade(id);
        expect(b.upgradeEnd).toBeUndefined();
        m.state.gold++;
        m.upgrade(id);
        const end = m.clock + e.seconds[level] * 1000;
        expect(b.upgradeEnd).toBe(end);
        expect(m.state.gold).toBe(0);
        expect(m.busy).toBe(1);
        m = new GameModel(structuredClone(m.state));
        b = m.state.buildings.find((b) => b.id === id)!;
        expect(b.upgradeEnd).toBe(end);
        expect(m.busy).toBe(1);
        m.tick(end - 1);
        expect(b.level).toBe(level);
        m.tick(end);
        expect(b.level).toBe(level + 1);
        expect(m.busy).toBe(0);
        m.tick(end + 1);
        expect(b.level).toBe(level + 1);
      }
      m.state.gold = 10000000;
      m.upgrade(id);
      expect(m.state.buildings.find((b) => b.id === id)!.upgradeEnd).toBeUndefined();
      expect(m.state.gold).toBe(10000000);
    });
    it('enforces Town Hall gates and counts, while retaining old above-cap traps and paid construction', () => {
      expect(Array.from({ length: 8 }, (_, i) => maxCountFor(kind, i + 1))).toEqual(e.counts);
      expect(maxLevelFor(kind, 8)).toBe(e.cap);
      const m = fundedVillage();
      m.state.obstacles = [];
      m.townhall!.level = e.unlock - 1;
      m.beginBuild(kind);
      expect(m.placement).toBeNull();
      m.placement = kind;
      expect(m.place(2, 2)).toBe(false);
      m.townhall!.level = e.unlock;
      m.beginBuild(kind);
      expect(m.place(2, 2)).toBe(true);
      const old = makeBuilding(m.state.nextId++, kind, 22, 2, BUILDINGS[kind].maxLevel);
      old.constructing = true;
      old.upgradeStart = m.clock;
      old.upgradeEnd = m.clock + 100000;
      m.state.buildings.push(old);
      const restored = new GameModel(structuredClone(m.state));
      const saved = restored.state.buildings.find((b) => b.id === old.id)!;
      expect(saved).toMatchObject({
        level: old.level,
        constructing: true,
        upgradeEnd: old.upgradeEnd,
      });
      restored.tick(old.upgradeEnd!);
      expect(saved.level).toBe(old.level);
      expect(saved.constructing).toBe(false);
      expect(validateSave(restored.state)).toBe(true);
    });
    it('uses the complete accepted table instead of a scaling formula', () => {
      expect(BUILDINGS[kind].cost).toBe(e.costs[0]);
      expect(BUILDINGS[kind].build).toBe(0);
      e.damage.forEach((value, i) => {
        expect(trapDamage(kind, i + 1)).toBe(value);
        if (i) {
          expect(upgradeCost(kind, i)).toBe(e.costs[i]);
          expect(upgradeSeconds(kind, i)).toBe(e.seconds[i]);
        }
      });
    });
  });

function arena(kind: (typeof kinds)[number], level: number, troop: TroopKind = 'giant') {
  const m = new GameModel();
  m.startBattle(0, true);
  const b = m.battle!;
  const trap = makeBuilding(9000, kind, 10, 10, level);
  b.buildings = [trap, makeBuilding(9001, 'townhall', 22, 22)];
  b.started = true;
  const center = 10 + BUILDINGS[kind].size / 2;
  const u: Unit = {
    id: 9002,
    kind: troop,
    x: center,
    y: center,
    hp: 10000,
    maxHp: 10000,
    cooldown: 1000,
    target: null,
    path: [],
    pathAt: 0,
    attacking: false,
  };
  b.units = [u];
  return { m, b, u, trap, center };
}
for (const kind of ['bomb', 'giantbomb', 'airbomb'] as const)
  it(`${kind} applies each accepted damage tier once at its blast boundary`, () => {
    for (let level = 1; level <= expected[kind].damage.length; level++) {
      const { b, u, center } = arena(kind, level, kind === 'airbomb' ? 'balloon' : 'giant');
      const d = trapStats(kind, level)!;
      const edge = { ...u, id: 9003, x: center + d.radius, path: [] },
        outside = { ...u, id: 9004, x: center + d.radius + 0.001, path: [] };
      b.units.push(edge, outside);
      b.elapsed = 0.05;
      stepTraps(b, 0.05, () => {});
      expect(u.hp).toBe(u.maxHp);
      b.elapsed += d.delay - 0.001;
      stepTraps(b, 0.001, () => {});
      expect(u.hp).toBe(u.maxHp);
      b.elapsed += 0.001;
      stepTraps(b, 0.001, () => {});
      expect(u.hp).toBe(u.maxHp - expected[kind].damage[level - 1]);
      expect(edge.hp).toBe(edge.maxHp - expected[kind].damage[level - 1]);
      expect(outside.hp).toBe(outside.maxHp);
      stepTraps(b, 0.05, () => {});
      expect(u.hp).toBe(u.maxHp - expected[kind].damage[level - 1]);
    }
  });
it('Giant Bomb radius grows at levels 2 and 4', () => {
  expect([1, 2, 3, 4, 5].map((level) => trapStats('giantbomb', level)!.radius)).toEqual([
    3, 3.5, 3.5, 4, 4,
  ]);
});
it('Spring Trap levels apply half hero damage and stun in place, including zero damage at level 1', () => {
  for (let level = 1; level <= 5; level++) {
    const { b, u } = arena('springtrap', level);
    u.hero = 'king';
    b.elapsed = 0.05;
    stepTraps(b, 0.05, () => {});
    expect(u.hp).toBe(u.maxHp - expected.springtrap.damage[level - 1] / 2);
    expect([u.x, u.y, u.ejected, u.springUntil]).toEqual([10.5, 10.5, false, 0.65]);
  }
});

it('a stunned hero still receives healing while movement and attacks are suspended', () => {
  const { m, b, u } = arena('springtrap', 1);
  u.hero = 'king';
  u.hp = 1000;
  u.springUntil = 1;
  u.attacking = true;
  b.auras.push({ kind: 'heal', x: u.x, y: u.y, start: 0, end: 12.3, pulses: 0 });
  m.step(0.1);
  expect(u.hp).toBe(1000 + 15 * 0.55);
  expect([u.x, u.y, u.attacking]).toEqual([10.5, 10.5, false]);
});

it('ending a battle prevents a pending Bomb from damaging troops later', () => {
  const { m, b, u } = arena('bomb', 1);
  stepTraps(b, 0.05, () => {});
  expect(b.traps[9000].resolved).toBe(false);
  m.finishBattle();
  m.step(2);
  expect(u.hp).toBe(u.maxHp);
});
