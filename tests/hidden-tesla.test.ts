import { ReleasedGameModel as GameModel } from './fixtures/released-combat';
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
import { makeBuilding, findPath, type Unit, type FX } from '../src/game/model';
import { concealedTesla, revealTeslas, targetableBuilding } from '../src/game/hidden-tesla';
import { stepProjectiles, launchProjectile } from '../src/game/projectiles';
import { validateSave } from '../src/game/save';
import { REPLAY_VERSION, validateReplay } from '../src/game/replay';
import { TESLA_LEVELS } from '../src/game/tesla-stats';
import { requiredTownHall } from '../src/game/progression';
import { makeReplayFile } from '../src/game/replay-file';

function arena(level = 1) {
  const m = new GameModel();
  m.startBattle(0, true);
  const b = m.battle!;
  const tower = makeBuilding(9000, 'tesla', 10, 10, level);
  b.buildings = [tower, makeBuilding(9001, 'townhall', 30, 30)];
  b.started = true;
  const effects: FX[] = [];
  m.onEffect = (fx) => effects.push(fx);
  return { m, b, tower, effects };
}
function unit(m: GameModel, x = 16, y = 11, kind: TroopKind = 'swordsman') {
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

it('uses native TH7–8 counts, ceilings, damage, HP, costs and destination timers', () => {
  expect(Array.from({ length: 9 }, (_, i) => maxCountFor('tesla', i + 1))).toEqual([
    0, 0, 0, 0, 0, 0, 2, 3, 4,
  ]);
  expect(Array.from({ length: 9 }, (_, i) => maxLevelFor('tesla', i + 1))).toEqual([
    0, 0, 0, 0, 0, 0, 3, 6, 7,
  ]);
  expect([1, 2, 3, 4, 5, 6].map((l) => buildingHp('tesla', l))).toEqual([
    600, 630, 660, 690, 730, 770,
  ]);
  expect([1, 2, 3, 4, 5, 6].map((l) => defenseDps('tesla', l))).toEqual([34, 40, 48, 55, 64, 75]);
  expect([1, 2, 3, 4, 5].map((l) => upgradeCost('tesla', l))).toEqual([
    350000, 500000, 600000, 800000, 1200000,
  ]);
  expect([1, 2, 3, 4, 5].map((l) => upgradeSeconds('tesla', l))).toEqual([
    10800, 14400, 21600, 43200, 86400,
  ]);
  expect(BUILDINGS.tesla).toMatchObject({
    size: 2,
    cost: 250000,
    build: 7200,
    range: 7,
    rate: 0.6,
    targets: 'both',
  });
});

it('uses every imported Tesla level in combat without changing the home progression ceiling', () => {
  expect(BUILDINGS.tesla.maxLevel).toBe(17);
  for (const row of TESLA_LEVELS) {
    expect(buildingHp('tesla', row.level)).toBe(row.hp);
    expect(defenseDps('tesla', row.level)).toBe(row.dps);
    expect(defenseDamage('tesla', row.level)).toBeCloseTo(row.dps * 0.6);
    expect(requiredTownHall('tesla', row.level)).toBe(row.townhall);
    if (row.level > 1) {
      expect(upgradeCost('tesla', row.level - 1)).toBe(row.cost);
      expect(upgradeSeconds('tesla', row.level - 1)).toBe(row.seconds);
    }
    const { m } = arena(row.level);
    const target = unit(m, 16, 11, 'dragon');
    m.step(0.05);
    expect(target.hp).toBeCloseTo(5000 - row.dps * 0.6);
  }
  expect(maxLevelFor('tesla', 8)).toBe(6);
});

describe('concealment', () => {
  it.each(TROOP_KEYS)('reveals at six tiles for living %s, then remains visible', (kind) => {
    const { m, b, tower, effects } = arena();
    const u = unit(m, 17.001, 11, kind);
    expect(revealTeslas(b, m.onEffect)).toBe(false);
    u.x = 17;
    expect(revealTeslas(b, m.onEffect)).toBe(true);
    expect(b.revealedTeslas?.[tower.id]).toBe(0);
    expect(concealedTesla(b, tower)).toBe(false);
    u.x = 40;
    expect(revealTeslas(b, m.onEffect)).toBe(false);
    expect(m.visibleBuilding(tower)).toBe(true);
    expect(effects.filter((f) => f.type === 'tesla-reveal')).toHaveLength(1);
  });
  it('ignores dead units and uses a circle, not a square', () => {
    const { m, b, tower } = arena();
    unit(m, 11, 11).hp = 0;
    unit(m, 16, 16);
    revealTeslas(b, m.onEffect);
    expect(concealedTesla(b, tower)).toBe(true);
  });
  it('keeps scouting, placement boundaries, spells and damage unaware of hidden towers', () => {
    const { m, b, tower } = arena();
    b.started = false;
    expect(m.visibleBuilding(tower)).toBe(false);
    expect(m.deployBlocked(11, 11)).toBe(false);
    expect(targetableBuilding(b, tower)).toBe(false);
    m.damage(tower, 9999);
    m.activeSpell = 'lightning';
    b.spells.lightning = 2;
    expect(m.castSpell(11, 11)).toBe(true);
    expect(tower.hp).toBe(600);
    expect(b.defenseStuns[tower.id]).toBeUndefined();
    expect(tower.cooldown).toBe(0);
    unit(m);
    revealTeslas(b, m.onEffect);
    expect(m.deployBlocked(11, 11)).toBe(true);
    m.activeSpell = 'lightning';
    m.castSpell(11, 11);
    expect(tower.hp).toBeLessThan(600);
    expect(b.defenseStuns[tower.id]).toBeGreaterThan(0);
  });
  it('does not leak hidden footprints into offensive targeting or paths', () => {
    const { m, b, tower } = arena();
    const target = makeBuilding(9002, 'goldmine', 15, 10);
    b.buildings.push(target);
    const u = unit(m, 4, 11, 'giant');
    delete u.springUntil;
    const expected = findPath(
      u,
      target,
      b.buildings.filter((v) => v.id !== tower.id),
      1,
    );
    m.step(0.05);
    expect(u.target).toBe(target.id);
    expect(u.path).toEqual(expected);
    expect(u.path.some((p) => p.x >= 10 && p.x < 12 && p.y >= 10 && p.y < 12)).toBe(true);
    expect(concealedTesla(b, tower)).toBe(true);
  });
  it('invalidates offense targets and paths on reveal while preserving healer assignments', () => {
    const { m, b, tower } = arena();
    const giant = unit(m),
      healer = unit(m, 16, 11, 'healer');
    giant.target = 9001;
    giant.path = [{ x: 12, y: 12 }];
    giant.pathAt = 1;
    healer.healTarget = giant.id;
    healer.path = [{ x: 12, y: 12 }];
    revealTeslas(b, m.onEffect);
    expect(giant).toMatchObject({ target: null, path: [], pathAt: 0 });
    expect(healer.healTarget).toBe(giant.id);
    delete giant.springUntil;
    m.step(0.05);
    expect(giant.target).toBe(tower.id);
  });
  it.each(['constructing', 'upgradeEnd'] as const)(
    '%s Teslas are visible and damageable but inactive',
    (field) => {
      const { m, b, tower } = arena();
      if (field === 'constructing') tower.constructing = true;
      else tower.upgradeEnd = m.clock + 100000;
      const u = unit(m);
      expect(m.visibleBuilding(tower)).toBe(true);
      expect(m.deployBlocked(11, 11)).toBe(true);
      m.step(0.05);
      expect(u.hp).toBe(5000);
      expect(b.revealedTeslas?.[tower.id]).toBeUndefined();
      m.damage(tower, 50);
      expect(tower.hp).toBe(550);
    },
  );
  it('protects hidden Teslas from a neighboring projectile explosion', () => {
    const { m, b, tower } = arena();
    const neighbor = makeBuilding(9002, 'cannon', 12, 10);
    b.buildings.push(neighbor);
    launchProjectile(
      b,
      {
        sourceId: 9001,
        fromX: 12,
        fromY: 11,
        x: 12,
        y: 11,
        damage: 100,
        splash: 2,
        weapon: 'fireball',
        targetBuilding: true,
        targetId: neighbor.id,
      },
      m.onEffect,
    );
    b.elapsed = 10;
    stepProjectiles(b, (target, power) => m.damage(target, power), m.onEffect);
    expect(neighbor.hp).toBeLessThan(neighbor.maxHp);
    expect(tower.hp).toBe(tower.maxHp);
  });
  it('counts hidden towers toward destruction and reveals all at 51%, not 50%', () => {
    const { m, b, tower } = arena();
    b.buildings = [
      tower,
      ...Array.from({ length: 99 }, (_, i) => makeBuilding(9100 + i, 'builder', 30, 30)),
    ];
    b.buildings.slice(1, 51).forEach((v) => (v.hp = 0));
    m.step(0.05);
    expect(b.destruction).toBe(50);
    expect(concealedTesla(b, tower)).toBe(true);
    b.buildings[51].hp = 0;
    m.step(0.05);
    expect(b.destruction).toBe(51);
    expect(concealedTesla(b, tower)).toBe(false);
    b.buildings.slice(1).forEach((v) => (v.hp = 0));
    m.step(0.05);
    expect(b.destruction).toBe(99);
    expect(b.finished).toBe(false);
    m.damage(tower, 9999);
    m.step(0.05);
    expect(b.destruction).toBe(100);
    expect(b.finished).toBe(true);
  });
  it('does not force a reveal when visible structures are gone below the threshold', () => {
    const { m, b } = arena();
    b.buildings = [
      makeBuilding(1, 'tesla', 10, 10),
      makeBuilding(2, 'tesla', 15, 15),
      makeBuilding(3, 'builder', 30, 30),
    ];
    b.buildings[2].hp = 0;
    m.step(0.05);
    expect(b.destruction).toBe(33);
    expect(b.revealedTeslas).toBeUndefined();
  });
});

describe('electrical attacks', () => {
  it('stays dormant inside attack range until triggered, then hits instantly up to seven tiles', () => {
    const { m, b, tower, effects } = arena(6);
    const u = unit(m, 17.5, 11, 'dragon');
    m.step(0.05);
    expect(u.hp).toBe(5000);
    u.x = 17;
    m.step(0.05);
    expect(u.hp).toBe(4955);
    expect(b.projectiles ?? []).toHaveLength(0);
    expect(effects.at(-1)).toMatchObject({ type: 'tesla-zap', toAir: true, targetId: u.id });
    u.x = 18.001;
    tower.cooldown = 0;
    m.step(0.05);
    expect(u.hp).toBe(4955);
    u.x = 18;
    m.step(0.05);
    expect(u.hp).toBe(4910);
  });
  it('fires at 0.6s cadence across uneven simulation frames without idle bursts', () => {
    const { m, b, tower, effects } = arena();
    unit(m);
    const times: number[] = [];
    m.onEffect = (fx) => {
      effects.push(fx);
      if (fx.type === 'tesla-zap') times.push(b.elapsed);
    };
    for (let i = 0; i < 100; i++) m.step(i % 2 ? 0.03 : 0.07);
    expect(times.length).toBe(9);
    for (let i = 1; i < times.length; i++)
      expect(Math.abs(times[i] - times[0] - i * 0.6)).toBeLessThanOrEqual(0.071);
    b.units[0].x = 40;
    for (let i = 0; i < 100; i++) m.step(0.05);
    expect(tower.cooldown).toBeLessThan(0);
    b.units[0].x = 16;
    m.step(0.05);
    expect(times).toHaveLength(10);
    expect(tower.cooldown).toBeCloseTo(0.6);
  });
  it('locks one target and gives P.E.K.K.A neither priority nor extra damage', () => {
    const { m, b, tower } = arena();
    const first = unit(m, 16, 11),
      pekka = unit(m, 16.5, 11, 'pekka');
    m.step(0.05);
    expect(first.hp).toBeCloseTo(5000 - defenseDamage('tesla', 1));
    expect(pekka.hp).toBe(5000);
    pekka.x = 12;
    tower.cooldown = 0;
    m.step(0.05);
    expect(b.defenseTargets[tower.id]).toBe(first.id);
    expect(pekka.hp).toBe(5000);
    first.hp = 0;
    tower.cooldown = 0;
    m.step(0.05);
    expect(pekka.hp).toBeCloseTo(5000 - defenseDamage('tesla', 1));
  });
  it('honors Lightning stuns and stops firing after destruction', () => {
    const { m, b, tower } = arena(6);
    const u = unit(m);
    m.step(0.05);
    const hp = u.hp;
    m.activeSpell = 'lightning';
    b.spells.lightning = 1;
    m.castSpell(11, 11);
    for (let i = 0; i < 13; i++) m.step(0.05);
    expect(u.hp).toBe(hp);
    m.step(0.1);
    expect(u.hp).toBeLessThan(hp);
    m.damage(tower, 9999);
    const after = u.hp;
    for (let i = 0; i < 20; i++) m.step(0.05);
    expect(u.hp).toBe(after);
  });
});

it.each([6, 17])(
  'preserves Tesla level %i and reconstructs reveal/attack state after exported replay and seeking',
  (level) => {
    const m = new GameModel();
    m.state.obstacles = [];
    m.state.buildings = [
      makeBuilding(1, 'townhall', 15, 15, 8),
      makeBuilding(2, 'builder', 25, 25),
      makeBuilding(3, 'tesla', 6, 10, level),
    ];
    m.state.nextId = 4;
    m.state.army = Object.fromEntries(
      TROOP_KEYS.map((k) => [k, k === 'dragon' ? 3 : 0]),
    ) as typeof m.state.army;
    expect(validateSave(m.state)).toBe(true);
    expect(m.visibleBuilding(m.state.buildings[2])).toBe(true);
    m.startBattle(0, true);
    m.step(0.05);
    m.activeTroop = 'dragon';
    expect(m.deploy(1, 11)).toBe(true);
    for (let i = 0; i < 200; i++) m.step(0.05);
    m.finishBattle();
    const before = JSON.parse(JSON.stringify(m.battle));
    expect(before.revealedTeslas[3]).toBeGreaterThan(0);
    const record = m.state.raidLog![0];
    const imported = JSON.parse(JSON.stringify(makeReplayFile(record.replay!))).replay;
    expect(imported.version).toBe(51);
    expect(validateReplay(imported)).toBe(true);
    record.replay = imported;
    m.returnHome();
    m.startReplay(record.id);
    for (let i = 0; i < 1000 && !m.replay!.complete; i++) m.step(0.1);
    const after = JSON.parse(JSON.stringify(m.battle));
    for (const key of ['buildings', 'units', 'revealedTeslas', 'teslas', 'result'])
      expect(after[key]).toEqual(before[key]);
    m.seekReplay(0);
    for (let i = 0; i < 50 && m.replay!.seeking; i++) m.step(0.05);
    expect(m.battle!.revealedTeslas).toBeUndefined();
    expect(m.visibleBuilding(m.battle!.buildings[2])).toBe(false);
    m.returnHome();
    m.startBattle(0, true);
    expect(m.battle!.revealedTeslas).toBeUndefined();
    expect(m.state.buildings[2].hp).toBe(TESLA_LEVELS[level - 1].hp);
  },
);
