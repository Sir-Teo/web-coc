import { bomberPose } from '../src/game/bomb-tower-poses';
import { describe, expect, it } from 'vitest';
import {
  BUILDINGS,
  TROOP_KEYS,
  buildingHp,
  defenseDamage,
  defenseDps,
  maxCountFor,
  maxLevelFor,
  upgradeCost,
  upgradeSeconds,
  type TroopKind,
} from '../src/game/data';
import { GameModel, makeBuilding, type Unit, type FX } from '../src/game/model';
import { BOMB_TOWER, stepDeathBombs } from '../src/game/bomb-tower';
import { stepProjectiles, launchProjectile } from '../src/game/projectiles';
import { validateSave } from '../src/game/save';
import { REPLAY_VERSION, validateReplay } from '../src/game/replay';
import { makeReplayFile } from '../src/game/replay-file';

function arena(level = 1) {
  const m = new GameModel();
  m.startBattle(0, true);
  const b = m.battle!,
    tower = makeBuilding(9000, 'bombtower', 10, 10, level);
  b.buildings = [tower, makeBuilding(9001, 'townhall', 30, 30)];
  b.started = true;
  const effects: FX[] = [];
  m.onEffect = (fx) => effects.push(fx);
  return { m, b, tower, effects };
}
function unit(m: GameModel, x = 16, y = 11.5, kind: TroopKind = 'swordsman') {
  const u: Unit = {
    id: 10000 + m.battle!.units.length,
    kind,
    x,
    y,
    hp: 5000,
    maxHp: 5000,
    cooldown: 99,
    target: null,
    path: [],
    pathAt: 0,
    attacking: false,
    springUntil: 1000,
  };
  m.battle!.units.push(u);
  return u;
}
it('uses native TH8 availability, both levels and destination upgrade values', () => {
  expect(Array.from({ length: 9 }, (_, i) => maxCountFor('bombtower', i + 1))).toEqual([
    0, 0, 0, 0, 0, 0, 0, 1, 1,
  ]);
  expect(Array.from({ length: 9 }, (_, i) => maxLevelFor('bombtower', i + 1))).toEqual([
    0, 0, 0, 0, 0, 0, 0, 2, 3,
  ]);
  expect([1, 2].map((l) => buildingHp('bombtower', l))).toEqual([650, 700]);
  expect([1, 2].map((l) => defenseDps('bombtower', l))).toEqual([24, 28]);
  expect(defenseDamage('bombtower', 1)).toBeCloseTo(26.4);
  expect(defenseDamage('bombtower', 2)).toBeCloseTo(30.8);
  expect(upgradeCost('bombtower', 1)).toBe(1000000);
  expect(upgradeSeconds('bombtower', 1)).toBe(64800);
  expect(BUILDINGS.bombtower).toMatchObject({
    size: 3,
    cost: 700000,
    build: 43200,
    range: 6,
    rate: 1.1,
    splash: 1.5,
    targets: 'ground',
  });
});
describe('fixed-point thrown bombs', () => {
  it.each(
    [24, 28, 32, 40, 48, 56, 64, 72, 84, 94, 104, 114, 122].map((dps, i) => ({
      level: i + 1,
      dps,
    })),
  )('level $level lands the original normal attack damage', ({ level, dps }) => {
    const { m, b } = arena(level);
    const target = unit(m),
      air = unit(m, 16, 11.5, 'dragon');
    m.step(0.05);
    const shot = b.projectiles![0];
    expect(shot.damage).toBeCloseTo(dps * 1.1, 10);
    b.elapsed = shot.impact;
    stepProjectiles(b, (t, p, at) => m.damage(t, p, at), m.onEffect);
    expect(target.hp).toBeCloseTo(5000 - dps * 1.1, 10);
    expect(air.hp).toBe(5000);
  });
  it('waits for travel, retains the landing point and can miss a moving target', () => {
    const { m, b, tower, effects } = arena();
    const target = unit(m);
    m.step(0.05);
    const shot = b.projectiles![0];
    expect(shot.weapon).toBe('towerbomb');
    expect(shot.impact - shot.launched).toBeCloseTo(4.5 / BOMB_TOWER.speed);
    expect(target.hp).toBe(5000);
    target.x = 18;
    const bystander = unit(m, 16, 11.5),
      air = unit(m, 16, 11.5, 'dragon');
    m.damage(tower, 9999);
    b.elapsed = shot.impact - 0.001;
    stepProjectiles(b, (t, p, at) => m.damage(t, p, at), m.onEffect);
    expect(shot.x).toBe(16);
    expect(bystander.hp).toBe(5000);
    b.elapsed = shot.impact;
    stepProjectiles(b, (t, p, at) => m.damage(t, p, at), m.onEffect);
    expect(target.hp).toBe(5000);
    expect(air.hp).toBe(5000);
    expect(bystander.hp).toBeCloseTo(4973.6);
    expect(effects.filter((f) => f.type === 'impact')).toHaveLength(1);
    stepProjectiles(b, (t, p, at) => m.damage(t, p, at), m.onEffect);
    expect(bystander.hp).toBeCloseTo(4973.6);
  });
  it('keeps splash at the original location when the original target dies', () => {
    const { m, b } = arena(2);
    const target = unit(m),
      edge = unit(m, 17.5),
      outside = unit(m, 17.501);
    m.step(0.05);
    target.hp = 0;
    b.elapsed = b.projectiles![0].impact;
    stepProjectiles(b, (t, p, at) => m.damage(t, p, at), m.onEffect);
    expect(edge.hp).toBeCloseTo(4969.2);
    expect(outside.hp).toBe(5000);
  });
  it('only acquires ground troops inside six tiles and preserves its target lock', () => {
    const { m, b, tower } = arena();
    unit(m, 12, 11.5, 'dragon');
    const target = unit(m, 17.501);
    m.step(0.05);
    expect(b.projectiles ?? []).toHaveLength(0);
    target.x = 17.5;
    m.step(0.05);
    expect(b.projectiles).toHaveLength(1);
    const closer = unit(m, 12);
    tower.cooldown = 0;
    m.step(0.05);
    expect(b.defenseTargets[tower.id]).toBe(target.id);
    target.x = 18;
    tower.cooldown = 0;
    m.step(0.05);
    expect(b.defenseTargets[tower.id]).toBe(closer.id);
  });
  it('fires at 1.1-second cadence across uneven frames and never accumulates idle bursts', () => {
    const { m, b, tower } = arena();
    const target = unit(m),
      times: number[] = [];
    m.onEffect = (fx) => {
      if (fx.type === 'projectile') times.push(b.elapsed);
    };
    for (let i = 0; i < 110; i++) m.step(i % 2 ? 0.03 : 0.07);
    expect(times).toHaveLength(5);
    for (let i = 1; i < times.length; i++)
      expect(Math.abs(times[i] - times[0] - i * 1.1)).toBeLessThan(0.071);
    target.x = 40;
    for (let i = 0; i < 100; i++) m.step(0.05);
    target.x = 16;
    m.step(0.05);
    expect(times).toHaveLength(6);
    expect(tower.cooldown).toBeCloseTo(1.1);
  });
  it.each(['constructing', 'upgradeEnd'] as const)(
    'disables the weapon and death charge during %s',
    (field) => {
      const { m, b, tower } = arena();
      unit(m);
      if (field === 'constructing') tower.constructing = true;
      else tower.upgradeEnd = Date.now() + 100000;
      m.step(0.1);
      expect(b.projectiles ?? []).toHaveLength(0);
      m.damage(tower, 9999);
      expect(b.deathBombs).toBeUndefined();
    },
  );
});
describe('destruction charge', () => {
  it.each(Array.from({ length: 13 }, (_, i) => i + 1))(
    'level %i primes once and deals ground-only damage at one second',
    (level) => {
      const { m, b, tower, effects } = arena(level);
      const center = unit(m, 11.5),
        edge = unit(m, 14.25),
        outside = unit(m, 14.251),
        air = unit(m, 11.5, 11.5, 'balloon');
      m.damage(tower, 10000);
      m.damage(tower, 10000);
      expect(Object.values(b.deathBombs!)).toHaveLength(1);
      b.elapsed = 0.999;
      stepDeathBombs(b, m.onEffect);
      expect(center.hp).toBe(5000);
      b.elapsed = 1;
      stepDeathBombs(b, m.onEffect);
      const hp =
        5000 - [150, 180, 220, 260, 300, 350, 400, 450, 500, 550, 600, 650, 700][level - 1];
      expect(center.hp).toBe(hp);
      expect(edge.hp).toBe(hp);
      expect(outside.hp).toBe(5000);
      expect(air.hp).toBe(5000);
      stepDeathBombs(b, m.onEffect);
      expect(center.hp).toBe(hp);
      expect(effects.filter((f) => f.type === 'blast')).toEqual([
        expect.objectContaining({ weapon: 'towerbomb', radius: 2.75, x: 11.5, y: 11.5 }),
      ]);
    },
  );
  it('starts the fuse at the killing projectile impact, including a wider simulation step', () => {
    const { m, b, tower } = arena();
    unit(m, 11.5);
    const shot = launchProjectile(
      b,
      {
        weapon: 'arrow',
        sourceId: 10000,
        targetId: tower.id,
        targetBuilding: true,
        fromX: 6,
        fromY: 11.5,
        x: 11.5,
        y: 11.5,
        damage: 10000,
      },
      m.onEffect,
    );
    m.step(0.8);
    expect(b.deathBombs![tower.id].armedAt).toBe(shot.impact);
    expect(b.deathBombs![tower.id].impact).toBeCloseTo(shot.impact + 1);
    expect(b.deathBombs![tower.id].resolved).toBe(false);
    m.step(0.7);
    expect(b.deathBombs![tower.id].resolved).toBe(true);
  });
  it('allows troops to escape the fuse and handles deaths through the normal death-blast path', () => {
    const { m, b, tower } = arena();
    const escape = unit(m, 11.5),
      breaker = unit(m, 11.5, 11.5, 'wallbreaker');
    const neighbor = makeBuilding(9010, 'cannon', 13, 10);
    neighbor.hp = 1;
    b.buildings.push(neighbor);
    breaker.hp = 100;
    m.damage(tower, 9999);
    escape.x = 15;
    m.step(1);
    expect(escape.hp).toBe(5000);
    expect(breaker.spent).toBe(true);
    expect(neighbor.hp).toBe(0);
  });
  it.each(['manual', 'complete', 'deadline'] as const)(
    'cancels an outstanding fuse at a %s finish',
    (reason) => {
      const { m, b, tower } = arena();
      const u = unit(m, 11.5);
      if (reason === 'deadline') b.elapsed = 179.8;
      m.damage(tower, 9999);
      if (reason === 'complete') m.damage(b.buildings[1], 99999);
      if (reason === 'manual') m.finishBattle();
      else m.step(0.3);
      expect(b.finished).toBe(true);
      expect(b.deathBombs![tower.id].cancelled).toBe(true);
      m.step(2);
      expect(u.hp).toBe(5000);
    },
  );
  it('waits for an outstanding fuse before ending an exhausted army battle', () => {
    const { m, b, tower } = arena();
    for (const kind of TROOP_KEYS) b.remaining[kind] = 0;
    b.spells = { lightning: 0, heal: 0, rage: 0, freeze: 0, invisibility: 0 };
    b.hero = undefined;
    m.damage(tower, 9999);
    m.step(0.5);
    expect(b.finished).toBe(false);
    m.step(0.5);
    expect(b.finished).toBe(true);
    expect(b.deathBombs![tower.id].resolved).toBe(true);
  });
});
it('aligns native frame 11 with actual launches and holds the release direction through target loss', () => {
  const { m, b, tower } = arena();
  const target = unit(m);
  m.step(0.05);
  const at = b.elapsed;
  const sample = () => bomberPose(tower, b, b.elapsed, false);
  expect(b.bombTowers![tower.id].shots[0]).toMatchObject({ at, x: target.x, y: target.y });
  expect(sample()).toMatchObject({ action: 'attack', time: 11 / 24 });
  const facing = sample();
  b.elapsed = at + 9 / 24;
  target.hp = 0;
  expect(sample()).toMatchObject({
    action: 'attack',
    time: 20 / 24,
    direction: facing.direction,
    flip: facing.flip,
  });
  b.elapsed = at + 10 / 24;
  expect(sample().action).toBe('idle');
  target.hp = 5000;
  tower.cooldown = 0.1;
  expect(sample().time).toBeCloseTo(11 / 24 - 0.1);
  expect(sample().action).toBe('attack');
  expect(bomberPose(tower, b, b.elapsed, true)).toMatchObject({ action: 'idle', time: 0 });
  b.defenseStuns[tower.id] = b.elapsed + 1;
  expect(sample().action).toBe('idle');
});
it.each([2, 3, 4, 5, 6, 13])(
  'persists level %i and reconstructs projectiles and destruction charges after replay import and seeking',
  (level) => {
    const m = new GameModel();
    m.state.obstacles = [];
    m.state.buildings = [
      makeBuilding(1, 'townhall', 30, 30, 8),
      makeBuilding(2, 'builder', 26, 26),
      makeBuilding(3, 'bombtower', 6, 10, level),
    ];
    m.state.nextId = 4;
    m.state.army = Object.fromEntries(
      TROOP_KEYS.map((k) => [k, k === 'dragon' ? 3 : k === 'giant' ? 2 : 0]),
    ) as typeof m.state.army;
    expect(validateSave(m.state)).toBe(true);
    m.startBattle(0, true);
    for (const kind of ['giant', 'dragon'] as const) {
      m.activeTroop = kind;
      while (m.battle!.remaining[kind]) expect(m.deploy(1, 11)).toBe(true);
    }
    for (let i = 0; i < 500; i++) m.step(0.05);
    m.finishBattle();
    const before = JSON.parse(JSON.stringify(m.battle));
    expect(before.deathBombs[3].resolved).toBe(true);
    const record = m.state.raidLog![0],
      imported = JSON.parse(JSON.stringify(makeReplayFile(record.replay!))).replay;
    expect(imported.version).toBe(REPLAY_VERSION);
    expect(validateReplay(imported)).toBe(true);
    record.replay = imported;
    m.returnHome();
    m.startReplay(record.id);
    for (let i = 0; i < 1000 && !m.replay!.complete; i++) m.step(0.1);
    const after = JSON.parse(JSON.stringify(m.battle));
    for (const key of ['buildings', 'units', 'deathBombs', 'bombTowers', 'result'])
      expect(after[key]).toEqual(before[key]);
    m.seekReplay(0);
    for (let i = 0; i < 50 && m.replay!.seeking; i++) m.step(0.05);
    expect(m.battle!.deathBombs).toBeUndefined();
    m.returnHome();
    m.startBattle(0, true);
    expect(m.battle!.deathBombs).toBeUndefined();
    expect(m.state.buildings[2].hp).toBe(buildingHp('bombtower', level));
  },
);
