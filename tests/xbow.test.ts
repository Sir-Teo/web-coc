import { expect, it } from 'vitest';
import {
  BUILDINGS,
  buildingHp,
  defenseDamage,
  defenseDps,
  maxCountFor,
  maxLevelFor,
  upgradeCost,
  upgradeSeconds,
  unlockTownHall,
} from '../src/game/data';
import { GameModel, makeBuilding, type Unit } from '../src/game/model';
import { requiredTownHall } from '../src/game/progression';
import { launchProjectile, stepProjectiles, type CombatProjectile } from '../src/game/projectiles';
import { XBOW, XBOW_LEVELS, type XbowMode } from '../src/game/xbow-stats';
import { xbowState } from '../src/game/xbow';
import { validateSave } from '../src/game/save';
import { validateReplay, REPLAY_VERSION, replayBattle } from '../src/game/replay';
import { makeReplayFile } from '../src/game/replay-file';

function arena(mode: XbowMode = 'ground', level = 1, kind: Unit['kind'] = 'giant') {
  const m = new GameModel();
  m.startBattle(0, true);
  const b = m.battle!;
  const tower = makeBuilding(9000, 'xbow', 10, 10, level);
  tower.xbowMode = mode;
  b.buildings = [tower, makeBuilding(9002, 'townhall', 30, 30)];
  b.started = true;
  const u: Unit = {
    id: 9001,
    kind,
    x: 18.5,
    y: 11.5,
    hp: 1000000,
    maxHp: 1000000,
    springUntil: 100000,
    cooldown: 100000,
    target: tower.id,
    path: [],
    pathAt: 100000,
    attacking: false,
  };
  b.units = [u];
  const shots: CombatProjectile[] = [];
  m.onEffect = (fx) => {
    if (fx.type === 'projectile' && fx.sourceId === tower.id)
      shots.push(b.projectiles!.find((p) => p.id === fx.projectileId)!);
  };
  return { m, b, tower, u, shots };
}

it('uses all 13 native levels without rounding fractional shot damage or unlocking TH9 content early', () => {
  for (const row of XBOW_LEVELS) {
    expect(buildingHp('xbow', row.level)).toBe(row.hp);
    expect(defenseDps('xbow', row.level)).toBe(row.dps);
    expect(defenseDamage('xbow', row.level)).toBeCloseTo(row.dps * 0.128, 12);
    expect(requiredTownHall('xbow', row.level)).toBe(row.townhall);
    if (row.level > 1) {
      expect(upgradeCost('xbow', row.level - 1)).toBe(row.cost);
      expect(upgradeSeconds('xbow', row.level - 1)).toBe(row.seconds);
    }
    const { m, b, u } = arena('ground', row.level);
    m.step(0.01);
    const shot = b.projectiles![0];
    expect(shot).toMatchObject({
      weapon: 'xbowbolt',
      variant: row.projectile,
      damage: defenseDamage('xbow', row.level),
    });
    expect(shot.impact - shot.launched).toBeCloseTo(
      7 / (row.projectile === 1 ? 23 : row.projectile === 2 ? 24 : 25),
      12,
    );
    expect(u.hp).toBe(u.maxHp);
  }
  expect(BUILDINGS.xbow).toMatchObject({
    size: 3,
    cost: 1000000,
    build: 43200,
    hp: 1500,
    damage: 7.68,
  });
  for (let th = 1; th <= 8; th++) {
    expect(maxCountFor('xbow', th)).toBe(0);
    expect(maxLevelFor('xbow', th)).toBe(0);
  }
  expect(unlockTownHall('xbow')).toBe(9);
});

it.each(['ground', 'both'] as const)(
  '%s mode obeys its exact boundary and target layer',
  (mode) => {
    const range = mode === 'ground' ? 14 : 11.5;
    for (const kind of ['giant', 'balloon'] as const) {
      const { m, b, tower, u, shots } = arena(mode, 1, kind);
      u.x = 11.5 + range + 0.001;
      m.step(0.01);
      expect(shots).toHaveLength(0);
      expect(xbowState(b, tower).ammunition).toBe(1500);
      u.x = 11.5 + range;
      m.step(0.01);
      const eligible = mode === 'both' || kind === 'giant';
      expect(shots).toHaveLength(eligible ? 1 : 0);
      expect(xbowState(b, tower).ammunition).toBe(eligible ? 1499 : 1500);
      if (eligible) expect(!!shots[0].toAir).toBe(kind === 'balloon');
    }
  },
);

it.each([20, 30, 60])(
  'preserves every 128 ms shot clock at %s simulation samples per second',
  (fps) => {
    const { m, b, tower, shots } = arena();
    for (let i = 0; i < 16 * fps; i++) m.step(1 / fps);
    expect(shots).toHaveLength(125);
    shots.forEach((shot, i) =>
      expect(shot.launched).toBeCloseTo(shots[0].launched + i * 0.128, 10),
    );
    expect(new Set(shots.map((p) => p.id)).size).toBe(shots.length);
    expect(xbowState(b, tower)).toMatchObject({ ammunition: 1375, fired: 125 });
    expect(xbowState(b, tower).shots).toHaveLength(16);
  },
);

it('tracks its retained target between shots and acquires a replacement without a historical burst', () => {
  const { m, b, tower, u, shots } = arena();
  m.step(0.05);
  const closer = { ...u, id: 9003, x: 13, path: [] };
  b.units.push(closer);
  u.y += 1;
  m.step(0.05);
  expect(xbowState(b, tower)).toMatchObject({ aimX: 7, aimY: 1 });
  expect(b.defenseTargets[tower.id]).toBe(u.id);
  u.x = 40;
  m.step(0.3);
  expect(shots).toHaveLength(2);
  expect(shots[1]).toMatchObject({ targetId: closer.id, launched: b.elapsed });
  closer.x = 40;
  m.step(3);
  expect(b.defenseTargets[tower.id]).toBeUndefined();
  closer.x = 13;
  m.step(0.01);
  expect(shots).toHaveLength(3);
  expect(tower.cooldown).toBeCloseTo(0.128, 12);
});

it('pauses reload progress during a stun and never spends ammunition while unavailable', () => {
  const { m, b, tower, shots } = arena();
  for (const flag of ['constructing', 'upgradeEnd'] as const) {
    if (flag === 'constructing') tower.constructing = true;
    else tower.upgradeEnd = m.clock + 100000;
    m.step(0.5);
    expect(shots).toHaveLength(0);
    delete tower[flag];
  }
  m.step(0.01);
  const first = shots[0].launched;
  b.defenseStuns[tower.id] = first + 0.5;
  m.step(0.5);
  expect(shots).toHaveLength(1);
  m.step(0.127);
  expect(shots).toHaveLength(1);
  m.step(0.001);
  expect(shots).toHaveLength(2);
  expect(shots[1].launched).toBeCloseTo(first + 0.5 + 0.128, 12);
});

it('exhausts exactly 1,500 bolts in an untimed campaign and retains the final flight after destruction', () => {
  const { m, b, tower, u, shots } = arena();
  b.practice = false;
  b.catalog = 'goblin-v1';
  for (let i = 0; i < 3840; i++) m.step(0.05);
  expect(shots).toHaveLength(1500);
  const state = xbowState(b, tower);
  expect(state).toMatchObject({ ammunition: 0, fired: 1500, emptyAt: shots.at(-1)!.launched });
  expect(b.projectiles!.some((p) => p.sourceId === tower.id)).toBe(true);
  const hp = u.hp;
  tower.hp = 0;
  for (let i = 0; i < 100; i++) m.step(0.05);
  expect(shots).toHaveLength(1500);
  expect(u.hp).toBeLessThan(hp);
  expect(u.hp).toBeCloseTo(u.maxHp - 1500 * 7.68, 6);
  expect(b.projectiles).toHaveLength(0);
  m.finishBattle();
  m.returnHome();
  m.startBattle(0, true);
  expect(m.battle!.xbows).toBeUndefined();
});

it('moves a tracking bolt at native speed, delaying arrival when its target moves away', () => {
  const { b, tower, u } = arena();
  const p = launchProjectile(
    b,
    {
      weapon: 'xbowbolt',
      variant: 1,
      sequence: 1,
      fromX: 11.5,
      fromY: 11.5,
      x: u.x,
      y: u.y,
      sourceId: tower.id,
      targetId: u.id,
      targetBuilding: false,
      damage: 7.68,
    },
    () => {},
  );
  const originalArrival = p.impact;
  const advance = (at: number) => {
    b.elapsed = at;
    stepProjectiles(
      b,
      () => {},
      () => {},
    );
  };
  advance(0.1);
  expect(p.flight!.x).toBeCloseTo(13.8, 12);
  u.x += 4;
  advance(originalArrival);
  expect(u.hp).toBe(u.maxHp);
  expect(p.flight!.x).toBeCloseTo(18.5, 12);
  expect(p.impact).toBeCloseTo(11 / 23, 12);
  advance(p.impact - 0.00001);
  expect(u.hp).toBe(u.maxHp);
  advance(p.impact);
  expect(u.hp).toBeCloseTo(u.maxHp - 7.68, 8);
  advance(b.elapsed + 1);
  expect(u.hp).toBeCloseTo(u.maxHp - 7.68, 8);
});

it('never transfers an airborne bolt to a replacement for a dead target', () => {
  const { m, b, tower, u } = arena();
  m.step(0.01);
  const spare = { ...u, id: 9003, path: [] };
  b.units.push(spare);
  u.hp = 0;
  tower.hp = 0;
  m.step(1);
  expect(spare.hp).toBe(spare.maxHp);
  expect(b.projectiles).toHaveLength(0);
});

it('saves target modes in layouts and canonical replay files and rejects malformed values', () => {
  const m = new GameModel();
  const tower = makeBuilding(9000, 'xbow', 2, 2, 3);
  m.state.buildings = [
    makeBuilding(9002, 'townhall', 10, 10, 8),
    makeBuilding(9003, 'builder', 30, 30),
    tower,
  ];
  m.state.nextId = 10000;
  m.state.obstacles = [];
  m.selected = tower.id;
  expect(m.toggleXbowMode()).toBe(true);
  expect(tower.xbowMode).toBe('both');
  expect(validateSave(m.state)).toBe(true);
  m.beginEdit();
  m.selected = tower.id;
  m.saveLayout(0);
  m.toggleXbowMode();
  expect(tower.xbowMode).toBe('ground');
  m.undo();
  expect(tower.xbowMode).toBe('both');
  m.redo();
  expect(tower.xbowMode).toBe('ground');
  m.loadLayout(0);
  expect(tower.xbowMode).toBe('both');
  m.endEdit();
  m.startBattle(0, true);
  expect(m.toggleXbowMode()).toBe(false);
  m.deploy(1, 13);
  m.step(0.05);
  m.finishBattle();
  const replay = m.state.raidLog![0].replay!;
  expect(replay.version).toBe(REPLAY_VERSION);
  expect(validateReplay(replay)).toBe(true);
  expect(replay.initial.buildings.find((b) => b.kind === 'xbow')!.xbowMode).toBe('both');
  const file = makeReplayFile(replay);
  expect(file.replay.initial.buildings.find((b) => b.kind === 'xbow')!.xbowMode).toBe('both');
  expect(replayBattle(replay.initial).xbows).toBeUndefined();
  const invalid = structuredClone(replay);
  (
    invalid.initial.buildings.find((b) => b.kind === 'xbow')! as unknown as { xbowMode: string }
  ).xbowMode = 'air';
  expect(validateReplay(invalid)).toBe(false);
  (tower as unknown as { xbowMode: string }).xbowMode = 'air';
  expect(validateSave(m.state)).toBe(false);
});
