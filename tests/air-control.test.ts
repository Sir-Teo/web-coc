import { describe, expect, it } from 'vitest';
import {
  BUILDINGS,
  buildingHp,
  maxCountFor,
  maxLevelFor,
  upgradeCost,
  upgradeSeconds,
  TROOP_KEYS,
  type TroopKind,
} from '../src/game/data';
import { GameModel, makeBuilding, type Unit, type FX } from '../src/game/model';
import { SWEEPER, sweeperStats } from '../src/game/air-control-stats';
import { inSweeperRange, stepSweepers, stepAirPush } from '../src/game/air-sweeper';
import { stepTraps } from '../src/game/traps';
import { validateSave, migrateSave } from '../src/game/save';
import { validateReplay } from '../src/game/replay';
import { makeReplayFile } from '../src/game/replay-file';

function arena(kind: 'airsweeper' | 'seekingairmine' = 'airsweeper', level = 1) {
  const m = new GameModel();
  m.startBattle(0, true);
  const tower = makeBuilding(9000, kind, 10, 10, level);
  const b = m.battle!;
  b.buildings = [tower, makeBuilding(9001, 'townhall', 30, 30)];
  b.started = true;
  return { m, b, tower };
}
function flyer(m: GameModel, x = 15, y = 11, kind: TroopKind = 'dragon') {
  const u: Unit = {
    id: 10000 + m.battle!.units.length,
    kind,
    x,
    y,
    hp: 5000,
    maxHp: 5000,
    cooldown: 20,
    target: null,
    path: [],
    pathAt: 0,
    attacking: false,
  };
  m.battle!.units.push(u);
  return u;
}
function advance(m: GameModel, seconds: number, effects: FX[] = [], push = true) {
  const b = m.battle!;
  for (let i = 0; i < Math.round(seconds / 0.05); i++) {
    b.elapsed += 0.05;
    stepSweepers(b, 0.05, (fx) => effects.push(fx));
    if (push) for (const u of b.units) stepAirPush(u, 0.05);
    stepTraps(b, 0.05, (fx) => effects.push(fx));
  }
}

it('uses the native TH6–8 Sweeper progression and TH7–8 mine counts', () => {
  expect(Array.from({ length: 8 }, (_, i) => maxLevelFor('airsweeper', i + 1))).toEqual([
    0, 0, 0, 0, 0, 2, 3, 4,
  ]);
  expect(Array.from({ length: 8 }, (_, i) => maxCountFor('seekingairmine', i + 1))).toEqual([
    0, 0, 0, 0, 0, 0, 1, 2,
  ]);
  expect([1, 2, 3, 4].map((l) => buildingHp('airsweeper', l))).toEqual([750, 800, 850, 900]);
  expect([1, 2, 3].map((l) => upgradeCost('airsweeper', l))).toEqual([300000, 450000, 800000]);
  expect([1, 2, 3].map((l) => upgradeSeconds('airsweeper', l))).toEqual([21600, 28800, 43200]);
  expect(BUILDINGS.airsweeper.build).toBe(14400);
  expect(BUILDINGS.seekingairmine.cost).toBe(12000);
  expect(BUILDINGS.seekingairmine.trap?.minHousing).toBe(5);
});

it('rotates eight directions, retains orientation in layout undo/redo and validates save bounds', () => {
  const m = new GameModel();
  m.state.obstacles = [];
  const tower = makeBuilding(m.state.nextId++, 'airsweeper', 3, 3);
  m.state.buildings.push(tower);
  m.selected = tower.id;
  m.editing = true;
  m.rotateSweeper();
  m.saveLayout(0);
  m.rotateSweeper();
  expect(tower.direction).toBe(2);
  m.undo();
  expect(tower.direction).toBe(1);
  m.redo();
  expect(tower.direction).toBe(2);
  m.loadLayout(0);
  expect(tower.direction).toBe(1);
  for (let i = 0; i < 7; i++) m.rotateSweeper();
  expect(tower.direction).toBe(0);
  const saved = migrateSave(JSON.parse(JSON.stringify(m.state))) as typeof m.state;
  expect(validateSave(saved)).toBe(true);
  saved.buildings.find((b) => b.id === tower.id)!.direction = 8;
  expect(validateSave(saved)).toBe(false);
  tower.direction = undefined;
  expect(validateSave(m.state)).toBe(true);
  m.state.layouts![0].slots.find((b) => b.id === tower.id)!.direction = NaN;
  expect(validateSave(m.state)).toBe(false);
});

describe('directional air displacement', () => {
  it.each([0, 1, 2, 3, 4, 5, 6, 7])(
    'covers facing %i and rejects behind, blind spot and out of range',
    (direction) => {
      const { tower } = arena();
      tower.direction = direction;
      const a = (direction * Math.PI) / 4;
      const point = (r: number, angle = a) => ({
        x: 11 + Math.cos(angle) * r,
        y: 11 + Math.sin(angle) * r,
      });
      expect(inSweeperRange(tower, point(5))).toBe(true);
      expect(inSweeperRange(tower, point(5, a + Math.PI))).toBe(false);
      expect(inSweeperRange(tower, point(0.9))).toBe(false);
      expect(inSweeperRange(tower, point(15.1))).toBe(false);
      expect(inSweeperRange(tower, point(5, a + SWEEPER.cone / 2 + 0.01))).toBe(false);
      for (const side of [-1, 1]) {
        expect(inSweeperRange(tower, point(5, a + (side * SWEEPER.cone) / 2))).toBe(true);
        expect(inSweeperRange(tower, point(5, a + side * (SWEEPER.cone / 2 + 5e-10)))).toBe(true);
        expect(inSweeperRange(tower, point(5, a + side * (SWEEPER.cone / 2 + 2e-9)))).toBe(false);
      }
    },
  );
  it.each([1, 2, 3, 4, 5, 6, 7])(
    'pushes once by level %i strength with no damage and no ground effect',
    (level) => {
      const { m } = arena('airsweeper', level);
      const air = flyer(m),
        ground = flyer(m, 15, 11, 'giant');
      air.attacking = true;
      advance(m, 3);
      expect(air.x).toBeCloseTo(15 + sweeperStats(level).push, 8);
      expect(air.hp).toBe(5000);
      expect(ground.x).toBe(15);
      expect(air.attacking).toBe(false);
      expect(air.airPush).toBeUndefined();
    },
  );
  it('winds up, sends a traveling narrow front, and fires every five seconds', () => {
    const { m, b } = arena();
    const events: FX[] = [];
    flyer(m);
    const farSide = flyer(m, 15, 15);
    advance(m, 0.6, events, false);
    expect(events.filter((e) => e.type === 'gust')).toHaveLength(0);
    advance(m, 0.05, events, false);
    expect(b.gusts).toHaveLength(1);
    expect(b.units[0].airPush).toBeUndefined();
    advance(m, 0.65, events, false);
    expect(b.units[0].airPush).toBeDefined();
    expect(farSide.airPush).toBeUndefined();
    advance(m, 4.35, events, false);
    expect(events.filter((e) => e.type === 'gust')).toHaveLength(2);
    expect(b.sweepers![9000].firedAt).toBeCloseTo(5.65, 8);
  });
  it('includes both wave width edges and excludes the opposite direction', () => {
    const { m, b, tower } = arena();
    tower.hp = 0;
    const inside = [flyer(m, 16, 13.5), flyer(m, 16, 8.5)];
    const outside = [flyer(m, 16, 13.501), flyer(m, 16, 8.499), flyer(m, 6, 11)];
    b.gusts = [
      {
        sourceId: tower.id,
        x: 11,
        y: 11,
        directionX: 1,
        directionY: 0,
        radius: 5,
        push: 1.6,
        hit: [],
        launched: 0,
      },
    ];
    stepSweepers(b, 0.1, () => {});
    for (const unit of inside) expect(unit.airPush).toBeDefined();
    for (const unit of outside) expect(unit.airPush).toBeUndefined();
    expect(b.gusts[0].hit).toEqual(inside.map((unit) => unit.id));
  });
  it('cancels windup on Lightning stun and resumes with a fresh preparation', () => {
    const { m, b } = arena();
    flyer(m);
    advance(m, 0.4);
    b.defenseStuns[9000] = b.elapsed + 0.1;
    advance(m, 0.6);
    expect(b.gusts).toHaveLength(0);
    advance(m, 0.15);
    expect(b.gusts!.length).toBeGreaterThan(0);
  });
  it('continues a launched gust after the tower falls, but fires no more', () => {
    const { m, tower } = arena();
    const air = flyer(m);
    advance(m, 0.65);
    tower.hp = 0;
    advance(m, 6);
    expect(air.x).toBeCloseTo(16.6, 8);
  });
  it.each(['giant', 'balloon'] as const)('%s prioritizes a zero-damage Sweeper', (kind) => {
    const { m, tower } = arena();
    m.battle!.buildings.push(makeBuilding(9002, 'goldmine', 6, 8));
    const u = flyer(m, 5, 9, kind);
    m.step(0.05);
    expect(u.target).toBe(tower.id);
  });
});

describe('Seeking Air Mine', () => {
  it.each(['balloon', 'healer', 'dragon'] as const)(
    'tracks %s at native speed and damages exactly one target',
    (kind) => {
      const { m, b } = arena('seekingairmine');
      const target = flyer(m, 14, 10.5, kind),
        neighbor = flyer(m, 14.1, 10.5);
      advance(m, 0.3);
      expect(b.traps[9000].x).toBe(10.5);
      advance(m, 0.05);
      expect(b.traps[9000].x).toBeCloseTo(10.5 + 3.5 * (0.3 - 7 / 24), 8);
      expect(target.hp).toBe(5000);
      target.y += 1;
      advance(m, 2);
      expect(target.hp).toBe(3500);
      expect(neighbor.hp).toBe(5000);
      expect(b.traps[9000].resolved).toBe(true);
      advance(m, 5);
      expect(target.hp).toBe(3500);
    },
  );
  it('never triggers for ground units and is inactive during construction or upgrade', () => {
    const { m, b, tower } = arena('seekingairmine');
    flyer(m, 11, 11, 'pekka');
    advance(m, 1);
    expect(b.traps[9000]).toBeUndefined();
    flyer(m, 11, 11);
    tower.constructing = true;
    advance(m, 1);
    expect(b.traps[9000]).toBeUndefined();
    tower.constructing = false;
    tower.upgradeEnd = 99;
    advance(m, 1);
    expect(b.traps[9000]).toBeUndefined();
  });
  it('consumes a mine when its target dies without hitting a neighbor', () => {
    const { m, b } = arena('seekingairmine');
    const target = flyer(m, 12, 10.5),
      neighbor = flyer(m, 13, 10.5);
    advance(m, 0.1);
    target.hp = 0;
    advance(m, 3);
    expect(b.traps[9000].resolved).toBe(true);
    expect(neighbor.hp).toBe(5000);
  });
});

it('replays mine flight, Sweeper rotation and knockback after JSON export', () => {
  const m = new GameModel();
  m.state.obstacles = [];
  m.state.buildings = [
    makeBuilding(1, 'townhall', 15, 15),
    makeBuilding(2, 'builder', 25, 25),
    { ...makeBuilding(3, 'airsweeper', 6, 10, 4), direction: 4 },
    makeBuilding(4, 'seekingairmine', 4, 10),
  ];
  m.state.nextId = 5;
  m.state.army = Object.fromEntries(
    TROOP_KEYS.map((k) => [k, k === 'dragon' ? 3 : 0]),
  ) as typeof m.state.army;
  m.startBattle(0, true);
  m.activeTroop = 'dragon';
  expect(m.deploy(1, 11)).toBe(true);
  for (let i = 0; i < 360; i++) m.step(0.05);
  m.finishBattle();
  const before = JSON.parse(JSON.stringify(m.battle));
  const record = m.state.raidLog![0];
  expect(validateReplay(record.replay)).toBe(true);
  // Use the export whitelist, which previously retained only building positions.
  const file = makeReplayFile(record.replay!);
  expect(JSON.stringify(file)).toContain('"direction":4');
  const imported = JSON.parse(JSON.stringify(file)).replay;
  expect(validateReplay(imported)).toBe(true);
  imported.initial.buildings.find((b: { kind: string }) => b.kind === 'airsweeper').direction = 8;
  expect(validateReplay(imported)).toBe(false);
  imported.initial.buildings.find((b: { kind: string }) => b.kind === 'airsweeper').direction = 4;
  record.replay = imported;
  m.returnHome();
  expect(m.startReplay(record.id)).toBe(true);
  for (let i = 0; i < 1000 && !m.replay!.complete; i++) m.step(0.1);
  expect(m.replay!.complete).toBe(true);
  const after = JSON.parse(JSON.stringify(m.battle));
  for (const key of ['buildings', 'units', 'traps', 'gusts', 'sweepers', 'result'])
    expect(after[key]).toEqual(before[key]);
});
