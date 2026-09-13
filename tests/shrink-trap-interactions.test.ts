import { expect, it } from 'vitest';
import { GameModel, makeBuilding, makeNpcBuilding, type Unit } from '../src/game/model';
import { applyShrink, isShrunk } from '../src/game/shrink-trap';
import { stepTraps } from '../src/game/traps';

function arena(kind: Unit['kind'], shrunk: boolean, x = 15) {
  const m = new GameModel();
  m.startBattle(0);
  m.discardRecording();
  const b = m.battle!,
    tower = makeBuilding(9001, 'townhall', 30, 30);
  b.buildings = [tower];
  b.started = true;
  const u: Unit = {
    id: 10000,
    kind,
    x,
    y: 30,
    hp: 1000,
    maxHp: 1500,
    cooldown: 1,
    target: tower.id,
    path: [],
    pathAt: 0,
    attacking: false,
  };
  b.units = [u];
  if (shrunk) applyShrink(u, 0);
  return { m, b, u, tower };
}
for (const hero of [false, true])
  for (const rage of [false, true])
    it(`applies a single slowdown after ${hero ? 'hero' : 'troop'} ${rage ? 'Rage/ability boosts' : 'base speed'}`, () => {
      const run = (shrink: boolean) => {
        const a = arena('swordsman', shrink);
        if (hero) {
          a.u.hero = 'king';
          a.b.hero = {
            level: 10,
            townhall: 8,
            unitId: a.u.id,
            abilityUsed: true,
            rageUntil: rage ? 20 : 0,
          };
        }
        if (rage) {
          a.u.spellRageUntil = 20;
          if (!hero) {
            a.u.summoned = true;
            a.u.rageUntil = 20;
          }
        }
        a.m.step(0.05);
        return a;
      };
      const normal = run(false),
        shrunk = run(true);
      const moved = (u: Unit) => Math.hypot(u.x - 15, u.y - 30);
      expect(moved(normal.u)).toBeGreaterThan(0);
      expect(moved(shrunk.u)).toBeCloseTo(moved(normal.u) / 2, 10);
      expect([normal.u.cooldown, shrunk.u.cooldown]).toEqual([0.95, 0.975]);
      expect([shrunk.u.hp, shrunk.u.maxHp]).toEqual([normal.u.hp, normal.u.maxHp]);
    });

it('keeps damage per hit while doubling the time to the next melee attack', () => {
  const run = (shrink: boolean) => {
    const a = arena('swordsman', shrink, 29.8);
    a.u.cooldown = 0;
    a.m.step(0.05);
    const first = a.tower.maxHp - a.tower.hp;
    const rate = a.m.troopStats('swordsman').rate;
    for (let i = 0; i < Math.ceil((rate + 0.1) / 0.05); i++) a.m.step(0.05);
    return { first, damage: a.tower.maxHp - a.tower.hp };
  };
  const normal = run(false),
    shrunk = run(true);
  expect(normal.first).toBeGreaterThan(0);
  expect(shrunk.first).toBe(normal.first);
  expect(normal.damage).toBe(normal.first * 2);
  expect(shrunk.damage).toBe(shrunk.first);
});

it('slows Healer travel and healing cadence without reducing healing per pulse', () => {
  const run = (shrink: boolean, close: boolean) => {
    const a = arena('healer', shrink, close ? 26 : 15);
    const ally: Unit = {
      ...structuredClone(a.u),
      id: 10001,
      kind: 'giant',
      x: 29,
      shrink: undefined,
    };
    a.b.units.push(ally);
    a.u.cooldown = 0;
    a.m.step(0.05);
    const pulse = a.b.projectiles?.find((p) => p.weapon === 'healing');
    const cooldown = a.u.cooldown;
    a.m.step(0.2);
    return { moved: a.u.x - (close ? 26 : 15), pulse, elapsed: cooldown - a.u.cooldown };
  };
  const normal = run(false, true),
    shrunk = run(true, true);
  expect(normal.pulse?.damage).toBeGreaterThan(0);
  expect(shrunk.pulse?.damage).toBe(normal.pulse?.damage);
  expect(normal.elapsed).toBeCloseTo(0.2, 12);
  expect(shrunk.elapsed).toBeCloseTo(0.1, 12);
  expect(run(true, false).moved).toBeCloseTo(run(false, false).moved / 2, 10);
});

it('overlapping traps refresh the same status and do not slow a spring throw or change its suspension', () => {
  const { m, b, u } = arena('swordsman', false, 11);
  u.y = 11;
  b.buildings.push(
    makeNpcBuilding(9002, 'shrink-trap', 10, 10),
    makeNpcBuilding(9003, 'shrink-trap', 10, 10),
  );
  stepTraps(b, 0.05, m.onEffect);
  b.elapsed = 2;
  stepTraps(b, 0.05, m.onEffect);
  expect(Object.values(b.traps).map((t) => t.shrink!.pulses)).toEqual([1, 1]);
  expect(isShrunk(u, 2)).toBe(true);
  u.springUntil = 2.6;
  const original = { x: u.x, y: u.y, cooldown: u.cooldown };
  m.step(0.1);
  expect({ x: u.x, y: u.y, cooldown: u.cooldown }).toEqual(original);
  expect(u.shrink!.timeLost).toBeCloseTo(0.05, 12);
  expect(u.springUntil).toBe(2.6);
});
