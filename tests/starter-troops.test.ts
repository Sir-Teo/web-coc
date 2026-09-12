import { describe, expect, it } from 'vitest';
import { GameModel, makeBuilding, findPath, distanceTo, type Unit } from '../src/game/model';
import { researchLaboratory, researchLevelForLab, TROOP_KEYS } from '../src/game/data';
import { developedSave } from './fixtures/developed-village';
import { migrateSave, validateSave } from '../src/game/save';
import { REPLAY_VERSION, validateReplay } from '../src/game/replay';

const reference = {
  swordsman: {
    hp: [45, 54, 65, 85, 105],
    damage: [9, 12, 15, 18, 23],
    cost: [10000, 50000, 130000, 300000],
    seconds: [1800, 3600, 7200, 14400],
    speed: 2.2,
    range: 0.4,
  },
  archer: {
    hp: [22, 26, 29, 33, 40],
    damage: [8, 10, 13, 16, 20],
    cost: [20000, 80000, 200000, 500000],
    seconds: [3600, 7200, 10800, 28800],
    speed: 3,
    range: 3.5,
  },
};
describe('Home Village starter troop progression', () => {
  for (const kind of ['swordsman', 'archer'] as const) {
    it(`${kind} uses the five researched levels in deployment and previews`, () => {
      const m = new GameModel(developedSave()),
        r = reference[kind];
      m.state.troopLevels = Object.fromEntries(TROOP_KEYS.map((k) => [k, 1])) as typeof m.state.army;
      for (let level = 1; level <= 5; level++) {
        m.state.troopLevels![kind] = level;
        expect(m.troopStats(kind)).toMatchObject({
          hp: r.hp[level - 1],
          damage: r.damage[level - 1],
          rate: 1,
          speed: r.speed,
          range: r.range,
          space: 1,
        });
        if (level < 5) {
          expect(m.troopStats(kind, level + 1).hp).toBe(r.hp[level]);
          expect(m.researchCost(kind)).toBe(r.cost[level - 1]);
          expect(m.researchSeconds(kind)).toBe(r.seconds[level - 1]);
          expect(researchLaboratory(kind, level)).toBe([1, 3, 5, 6][level - 1]);
        }
        m.startBattle(0, true);
        m.activeTroop = kind;
        expect(m.deploy(1, 13)).toBe(true);
        expect(m.battle!.units[0].maxHp).toBe(r.hp[level - 1]);
        m.finishBattle();
        m.returnHome();
      }
    });
    it(`${kind} can research at Lab 1 but waits for Lab 3 for the following level`, () => {
      const m = new GameModel(developedSave());
      const lab = m.state.buildings.find((b) => b.kind === 'laboratory')!;
      lab.level = 1;
      const elixir = m.state.elixir;
      m.researchTroop(kind);
      const deadline = m.state.research!.end;
      expect(deadline - m.clock).toBe(reference[kind].seconds[0] * 1000);
      expect(m.state.elixir).toBe(elixir - reference[kind].cost[0]);
      m.researchTroop(kind);
      expect(m.state.elixir).toBe(elixir - reference[kind].cost[0]);
      const restored = new GameModel(structuredClone(m.state));
      restored.tick(deadline);
      expect(restored.troopLevel(kind)).toBe(2);
      restored.state.buildings.find((b) => b.kind === 'laboratory')!.level = 2;
      const after = restored.state.elixir;
      restored.researchTroop(kind);
      expect(restored.state.research).toBeUndefined();
      expect(restored.state.elixir).toBe(after);
      expect([0, 1, 2, 3, 4, 5, 6].map((lab) => researchLevelForLab(kind, lab))).toEqual([
        1, 2, 2, 3, 3, 4, 5,
      ]);
    });
  }
  it('retains paid legacy deadlines and researched levels even below current lab requirements', () => {
    const save = developedSave();
    save.troopLevels = Object.fromEntries(TROOP_KEYS.map((k) => [k, 1])) as typeof save.army;
    save.buildings.find((b) => b.kind === 'laboratory')!.level = 1;
    save.troopLevels!.swordsman = 4;
    save.research = { kind: 'swordsman', end: save.lastTick + 300000 };
    const elixir = save.elixir;
    const restored = new GameModel(migrateSave(structuredClone(save)));
    expect(validateSave(restored.state)).toBe(true);
    expect(restored.state.research?.end).toBe(save.research.end);
    restored.tick(save.research.end);
    expect(restored.troopLevel('swordsman')).toBe(5);
    expect(restored.state.elixir).toBe(elixir);
    expect(restored.troopStats('swordsman')).toMatchObject({ hp: 105, damage: 23 });
    restored.tick(save.research.end + 100000);
    expect(restored.troopLevel('swordsman')).toBe(5);
    expect(restored.state.research).toBeUndefined();
  });
  it('keeps version-14 battle summaries without replaying changed combat', () => {
    const m = new GameModel();
    m.startBattle(0, true);
    m.finishBattle();
    m.returnHome();
    expect(REPLAY_VERSION).toBeGreaterThan(14);
    const record = m.state.raidLog![0];
    record.replay!.version = 14;
    const summary = structuredClone(record.result);
    expect(validateReplay(record.replay)).toBe(true);
    expect(validateSave(m.state)).toBe(true);
    expect(m.startReplay(record.id)).toBe(false);
    expect(record.result).toEqual(summary);
  });
});

const add = (m: GameModel, kind: Unit['kind'], x: number, y: number) => {
  const d = m.troopStats(kind);
  const u: Unit = {
    id: m.state.nextId++,
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
  m.battle!.units.push(u);
  return u;
};
describe('native short melee reach', () => {
  it.each([
    [6.5, 11.5],
    [17.5, 11.5],
    [11.5, 6.5],
    [11.5, 17.5],
    [6.5, 6.5],
    [17.5, 6.5],
    [6.5, 17.5],
    [17.5, 17.5],
  ])('finds a reachable 0.4-tile approach from %s,%s', (x, y) => {
    const target = makeBuilding(9000, 'townhall', 10, 10);
    const path = findPath({ x, y }, target, [target], 0.4);
    expect(path.length).toBeGreaterThan(0);
    expect(distanceTo(path.at(-1)!, target)).toBeLessThanOrEqual(0.4);
    expect(path.every((p) => distanceTo(p, target) > 0)).toBe(true);
    const m = new GameModel();
    m.startBattle(0, true);
    m.battle!.buildings = [target];
    m.battle!.started = true;
    const u = add(m, 'swordsman', x, y);
    for (let i = 0; i < 300 && target.hp === target.maxHp; i++) m.step(0.05);
    expect(target.maxHp - target.hp).toBe(9);
    expect(distanceTo(u, target)).toBeLessThanOrEqual(0.4);
    expect(distanceTo(u, target)).toBeGreaterThan(0);
  });
  it('can finish its approach from an adjacent cell and routes around solid obstacles', () => {
    const target = makeBuilding(9000, 'townhall', 12, 12),
      obstacle = makeBuilding(9001, 'goldstorage', 8, 12);
    expect(findPath({ x: 11.5, y: 13.5 }, target, [target], 0.4)).toHaveLength(1);
    const path = findPath({ x: 6.5, y: 13.5 }, target, [target, obstacle], 0.4);
    expect(path.every((p) => distanceTo(p, obstacle) > 0 && distanceTo(p, target) > 0)).toBe(true);
    expect(distanceTo(path.at(-1)!, target)).toBeLessThanOrEqual(0.4);
  });
  it('deals nine damage to a blocking wall and never enters it before the breach', () => {
    const m = new GameModel();
    m.startBattle(0, true);
    m.battle!.started = true;
    const hall = makeBuilding(9000, 'townhall', 16, 10);
    const walls = Array.from({ length: 48 }, (_, y) => makeBuilding(9001 + y, 'wall', 12, y));
    m.battle!.buildings = [hall, ...walls];
    const u = add(m, 'swordsman', 10.5, 11.5);
    for (let i = 0; i < 100 && walls.every((w) => w.hp === w.maxHp); i++) m.step(0.05);
    const wall = walls.find((w) => w.hp < w.maxHp)!;
    expect(wall.maxHp - wall.hp).toBe(9);
    for (let i = 0; i < 400 && u.x < 13; i++) {
      m.step(0.05);
      if (wall.hp > 0) expect(u.x).toBeLessThan(12);
    }
    expect(wall.hp).toBe(0);
    expect(u.x).toBeGreaterThanOrEqual(13);
  });
  it('moves at native tile speeds and only starts firing within Archer range', () => {
    for (const kind of ['swordsman', 'archer'] as const) {
      const m = new GameModel();
      m.startBattle(0, true);
      m.battle!.started = true;
      m.battle!.buildings = [makeBuilding(9000, 'townhall', 30, 10)];
      const u = add(m, kind, 10.5, 11.5);
      m.step(0.05);
      expect(u.x - 10.5).toBeCloseTo(reference[kind].speed * 0.05);
    }
    const m = new GameModel();
    m.startBattle(0, true);
    m.battle!.started = true;
    m.battle!.buildings = [makeBuilding(9000, 'townhall', 10, 10)];
    const u = add(m, 'archer', 6.49, 11.5);
    m.step(0.05);
    expect(m.battle!.projectiles).toHaveLength(0);
    u.x = 6.5;
    u.path = [];
    m.step(0.05);
    expect(m.battle!.projectiles[0].damage).toBe(8);
    expect(u.attacking).toBe(true);
  });
});
