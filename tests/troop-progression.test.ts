import { describe, expect, it } from 'vitest';
import { GameModel, makeBuilding, distanceTo, type Unit } from '../src/game/model';
import {
  researchLaboratory,
  researchLevelForLab,
  TROOP_KEYS,
  type TroopKind,
} from '../src/game/data';
import { stepProjectiles } from '../src/game/projectiles';
import { validateSave } from '../src/game/save';
import { REPLAY_VERSION, validateReplay } from '../src/game/replay';
import { developedSave } from './fixtures/developed-village';

// Independently transcribed Home Village reference values; see docs/TROOP-PROGRESSION.md.
const reference = {
  giant: {
    hp: [400, 500, 600, 700, 900],
    hit: [24, 30, 40, 48, 62],
    dps: [12, 15, 20, 24, 31],
    cost: [40000, 150000, 400000, 800000],
    hours: [2, 4, 6, 12],
    lab: [2, 4, 5, 6],
    speed: 1.5,
    range: 1,
    rate: 2,
    space: 5,
  },
  wizard: {
    hp: [75, 90, 108, 135, 165],
    hit: [75, 105, 135, 187.5, 255],
    dps: [50, 70, 90, 125, 170],
    cost: [120000, 300000, 600000, 1200000],
    hours: [4, 5, 12, 18],
    lab: [3, 4, 5, 6],
    speed: 2,
    range: 3,
    rate: 1.5,
    space: 4,
  },
  balloon: {
    hp: [150, 180, 216, 280, 390],
    hit: [75, 96, 144, 216, 324],
    dps: [25, 32, 48, 72, 108],
    cost: [100000, 400000, 720000, 1300000],
    hours: [4, 6, 18, 24],
    lab: [2, 4, 5, 6],
    speed: 1.25,
    range: 0.5,
    rate: 3,
    space: 5,
  },
  goblin: {
    hp: [25, 30, 36, 50, 65],
    hit: [11, 14, 19, 24, 32],
    dps: [11, 14, 19, 24, 32],
    cost: [45000, 100000, 500000, 700000],
    hours: [2, 3, 6, 12],
    lab: [1, 3, 5, 6],
    speed: 4,
    range: 0.4,
    rate: 1,
    space: 1,
  },
  wallbreaker: {
    hp: [20, 24, 29, 35, 53],
    hit: [10, 20, 25, 30, 43],
    dps: [10, 20, 25, 30, 43],
    cost: [80000, 200000, 450000, 1000000],
    hours: [3, 4, 12, 16],
    lab: [2, 4, 5, 6],
    speed: 3,
    range: 1,
    rate: 1,
    space: 2,
  },
};
const kinds = Object.keys(reference) as (keyof typeof reference)[];
const levels = (level: number) =>
  Object.fromEntries(TROOP_KEYS.map((k) => [k, level])) as Record<TroopKind, number>;
function arena(kind: TroopKind, level = 1, x = 9.5, y = 11) {
  const m = new GameModel(developedSave());
  m.state.troopLevels = levels(level);
  m.startBattle(0, true);
  const b = m.battle!;
  b.started = true;
  const target = makeBuilding(9000, 'townhall', 10, 10);
  b.buildings = [target];
  const d = m.troopStats(kind);
  const u: Unit = {
    id: 9500,
    kind,
    x,
    y,
    hp: d.hp,
    maxHp: d.hp,
    cooldown: 0,
    target: null,
    path: [],
    pathAt: 0,
    attacking: false,
  };
  b.units = [u];
  return { m, b, target, u };
}
function advance(m: GameModel, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 20); i++) m.step(0.05);
}

describe('native progression for the remaining five troops', () => {
  for (const kind of kinds) {
    const r = reference[kind];
    it(`${kind} deploys all five native levels and previews the exact next upgrade`, () => {
      const m = new GameModel(developedSave());
      for (let level = 1; level <= 5; level++) {
        m.state.troopLevels = levels(level);
        const d = m.troopStats(kind);
        expect(d).toMatchObject({
          hp: r.hp[level - 1],
          damage: r.hit[level - 1],
          speed: r.speed,
          range: r.range,
          rate: r.rate,
          space: r.space,
        });
        expect(d.damage / d.rate).toBe(r.dps[level - 1]);
        if (level < 5) {
          expect(m.troopStats(kind, level + 1)).toMatchObject({
            hp: r.hp[level],
            damage: r.hit[level],
          });
          expect(m.researchCost(kind)).toBe(r.cost[level - 1]);
          expect(m.researchSeconds(kind)).toBe(r.hours[level - 1] * 3600);
          expect(researchLaboratory(kind, level)).toBe(r.lab[level - 1]);
        }
        m.startBattle(0, true);
        m.activeTroop = kind;
        expect(m.deploy(1, 13)).toBe(true);
        expect(m.battle!.units[0].maxHp).toBe(r.hp[level - 1]);
        // Combat must use the recorded starting level even if the village changes.
        m.state.troopLevels[kind] = 1;
        expect(m.troopStats(kind).damage).toBe(r.hit[level - 1]);
        m.finishBattle();
        m.returnHome();
      }
    });
    it(`${kind} enforces each laboratory gate and retains paid deadlines across reload`, () => {
      for (let level = 1; level < 5; level++) {
        const m = new GameModel(developedSave());
        m.townhall!.level = 8;
        m.state.troopLevels = levels(level);
        m.state.elixir = 2000000;
        const lab = m.state.buildings.find((b) => b.kind === 'laboratory')!;
        lab.level = Math.max(1, r.lab[level - 1] - 1);
        if (r.lab[level - 1] > 1) {
          m.researchTroop(kind);
          expect(m.state.research).toBeUndefined();
          expect(m.state.elixir).toBe(2000000);
        }
        lab.level = r.lab[level - 1];
        m.researchTroop(kind);
        const end = m.state.research!.end;
        expect(end - m.clock).toBe(r.hours[level - 1] * 3600000);
        const paid = m.state.elixir;
        expect(paid).toBe(2000000 - r.cost[level - 1]);
        m.researchTroop(kind);
        expect(m.state.elixir).toBe(paid);
        expect(validateSave(m.state)).toBe(true);
        const restored = new GameModel(structuredClone(m.state));
        expect(restored.state.research?.end).toBe(end);
        restored.tick(end);
        expect(restored.troopLevel(kind)).toBe(level + 1);
        expect(restored.state.elixir).toBe(paid);
        restored.tick(end + 1000);
        expect(restored.troopLevel(kind)).toBe(level + 1);
        expect(restored.state.research).toBeUndefined();
      }
      expect(researchLevelForLab(kind, 6)).toBe(5);
    });
    it(`${kind} moves at its native tile speed`, () => {
      const { m, target, u } = arena(kind, 1, 5.5, 11.5);
      target.x = 30;
      m.step(0.05);
      expect(u.x - 5.5).toBeCloseTo(r.speed * 0.05);
    });
  }
  it('keeps paid legacy specialist research and old replay summaries without applying new rules to old playback', () => {
    const m = new GameModel(developedSave());
    m.state.troopLevels = levels(4);
    m.state.research = { kind: 'wizard', end: m.clock + 1000 };
    const paid = m.state.elixir;
    const restored = new GameModel(structuredClone(m.state));
    restored.tick(restored.state.research!.end);
    expect(restored.troopLevel('wizard')).toBe(5);
    expect(restored.state.elixir).toBe(paid);
    expect(validateSave(restored.state)).toBe(true);
    restored.startBattle(0, true);
    restored.finishBattle();
    restored.returnHome();
    const record = restored.state.raidLog![0];
    expect(record.replay!.version).toBe(REPLAY_VERSION);
    record.replay!.version = 15;
    const summary = structuredClone(record.result);
    expect(validateReplay(record.replay)).toBe(true);
    expect(validateSave(restored.state)).toBe(true);
    expect(restored.startReplay(record.id)).toBe(false);
    expect(record.result).toEqual(summary);
  });
});

describe('native specialist combat', () => {
  it('Giants prefer defenses and punch for 24 damage every two seconds', () => {
    const { m, b, target, u } = arena('giant', 1, 5.5, 11);
    const cannon = makeBuilding(9001, 'cannon', 16, 10);
    cannon.cooldown = 100;
    b.buildings.push(cannon);
    m.step(0.05);
    expect(u.target).toBe(cannon.id);
    expect(target.hp).toBe(target.maxHp);
    u.x = 15.1;
    u.cooldown = 0;
    m.step(0.05);
    expect(cannon.maxHp - cannon.hp).toBe(24);
    advance(m, 1.95);
    expect(cannon.maxHp - cannon.hp).toBe(24);
    m.step(0.05);
    expect(cannon.maxHp - cannon.hp).toBe(48);
    m.damage(cannon, cannon.hp);
    m.step(0.05);
    expect(u.target).toBe(target.id);
  });
  it.each(['darkdrill', 'darkstorage'] as const)(
    'Goblins prefer %s and apply double damage within 0.4 tiles',
    (kind) => {
      const { m, b, target, u } = arena('goblin', 3, 5.5, 11);
      target.kind = 'barracks';
      target.x = 6;
      const resource = makeBuilding(9001, kind, 14, 10);
      b.buildings.push(resource);
      m.step(0.05);
      expect(u.target).toBe(resource.id);
      u.x = 13.59;
      u.y = 11.5;
      u.path = [];
      u.pathAt = 0;
      m.step(0.05);
      expect(resource.hp).toBe(resource.maxHp);
      for (let i = 0; i < 20 && resource.hp === resource.maxHp; i++) m.step(0.05);
      expect(distanceTo(u, resource)).toBeLessThanOrEqual(0.4);
      expect(resource.maxHp - resource.hp).toBe(38);
      expect(target.hp).toBe(target.maxHp);
      m.damage(resource, resource.hp);
      m.step(0.05);
      expect(u.target).toBe(target.id);
    },
  );
  it('Wizard level four deals a fractional 187.5 damage on impact and never reaches beyond three tiles', () => {
    const { m, b, target, u } = arena('wizard', 4, 6.99, 11.5);
    m.step(0.05);
    expect(b.projectiles).toHaveLength(0);
    m.step(0.05);
    const shot = b.projectiles![0];
    expect(shot).toMatchObject({ damage: 187.5, splash: 0.3 });
    expect(target.hp).toBe(target.maxHp);
    u.cooldown = 100;
    advance(m, 0.5);
    expect(target.maxHp - target.hp).toBe(187.5);
  });
  it('Wizard splash uses the impact point and full damage only within its 0.3-tile footprint radius', () => {
    for (const [gap, hit] of [
      [0.299, true],
      [0.301, false],
    ] as const) {
      const { m, b, target } = arena('wizard');
      const neighbor = makeBuilding(9001, 'wall', 15, 11, 4);
      b.buildings.push(neighbor);
      target.hp = 0;
      // A fireball already in flight retains its last impact point when its target falls.
      b.projectiles = [
        {
          id: 'splash',
          weapon: 'fireball',
          sourceId: 9500,
          targetId: target.id,
          targetBuilding: true,
          fromX: 10,
          fromY: 11.5,
          x: 15 - gap,
          y: 11.5,
          launched: 0,
          impact: 0,
          damage: 75,
          splash: 0.3,
        },
      ];
      stepProjectiles(
        b,
        (t, power) => m.damage(t, power),
        () => {},
      );
      expect(neighbor.maxHp - neighbor.hp).toBe(hit ? 75 : 0);
      expect(b.projectiles).toHaveLength(0);
    }
  });
  it.each([1, 2, 3, 4, 5])(
    'Balloon level %s uses its researched death damage once within 1.2 tiles',
    (level) => {
      const { m, b, target, u } = arena('balloon', level, 8.8, 11);
      const far = makeBuilding(9001, 'wall', 8, 13);
      b.buildings.push(far);
      b.auras.push({ kind: 'rage', x: u.x, y: u.y, end: 100 });
      u.hp = 0;
      m.step(0.05);
      expect(target.maxHp - target.hp).toBe([25, 32, 48, 72, 108][level - 1]);
      expect(far.hp).toBe(far.maxHp);
      advance(m, 1);
      expect(target.maxHp - target.hp).toBe([25, 32, 48, 72, 108][level - 1]);
    },
  );
  it.each([1, 2, 3, 4, 5])(
    'Wall Breaker level %s combines hit and death damage on contact but only death damage when defeated',
    (level) => {
      for (const defeated of [false, true])
        for (const raged of [false, true]) {
          const { m, b, target, u } = arena('wallbreaker', level);
          const wall = makeBuilding(9001, 'wall', 10, 10, 8);
          // Keep the wall alive to measure the complete combined hit, including Rage.
          wall.hp = wall.maxHp = 10000;
          target.x = 11;
          target.y = 11;
          b.buildings.push(wall);
          u.target = wall.id;
          if (raged) b.auras.push({ kind: 'rage', x: u.x, y: u.y, end: 100 });
          if (defeated) u.hp = 0;
          const death = [6, 9, 13, 16, 23][level - 1];
          const attack = [10, 20, 25, 30, 43][level - 1] * (raged ? 1.7 : 1);
          const combined = death + (defeated ? 0 : attack);
          m.step(0.05);
          expect(wall.maxHp - wall.hp).toBeCloseTo(combined * 40);
          expect(target.maxHp - target.hp).toBeCloseTo(combined);
          expect(u.hp).toBe(0);
          expect(u.spent).toBe(true);
          const snapshot = b.buildings.map((v) => v.hp);
          advance(m, 1);
          expect(b.buildings.map((v) => v.hp)).toEqual(snapshot);
        }
    },
  );
});
