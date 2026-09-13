import { describe, expect, it } from 'vitest';
import combat from '../reference/tornado-trap/combat.json';
import { makeBuilding, type Battle, type Unit } from '../src/game/model';
import { BUILDINGS } from '../src/game/data';
import { distance2D } from '../src/game/distance';
import { spawnSkeleton } from '../src/game/defenders';
import { nativeBuildings, nativeCampaignIssues } from '../src/game/native-campaign';
import { validateReplay } from '../src/game/replay';
import { lateCampaignPending, lateUnitHeld, lateUnitRooted } from '../src/game/late-campaign';
import { stepTraps } from '../src/game/traps';
import {
  TORNADO_TRAP_READY,
  stepTornadoTrap,
  tornadoCarryPoint,
  tornadoTrapPending,
  type TornadoVortex,
} from '../src/game/tornado-trap';
import {
  TORNADO_TRAP_LEVELS,
  tornadoDrag,
  tornadoForcePercent,
  tornadoForceTier,
  tornadoTrapStats,
} from '../src/game/tornado-trap-stats';
import { lateTrapArena } from './fixtures/late-trap-battle';

const trapAt = (level = 1, x = 20, y = 20, id = 9000) => ({
  ...makeBuilding(id, 'tornadotrap', x, y, level),
  hp: 1,
  maxHp: 1,
});
const phase = (b: Battle, time: number, which: 'traps' | 'auras', dt = 0.05) => {
  b.elapsed = time;
  stepTornadoTrap({ battle: b, dt, phase: which, effect: () => {}, damageBuilding: () => {} });
};
const vortex = (b: Battle, id = 9000) => b.late!.tornadoTrap!.vortices[id] as TornadoVortex;

describe('campaign Tornado Trap', () => {
  it('uses the three pinned levels, their spell schedule and every native placement', () => {
    expect(TORNADO_TRAP_READY).toBe(true);
    expect(TORNADO_TRAP_LEVELS).toEqual(
      [1, 2, 3].map((level) => ({
        level,
        trigger: 3,
        damageRadius: 3,
        duration: 4 + level,
        minHousing: 1,
        air: true,
        ground: true,
        delay: 8 / 24,
        art: level === 1 ? 1 : 2,
        radius: 4,
        hitTime: 0.375,
        interval: 0.128,
        hits: [39, 47, 55][level - 1],
        damage: 1,
        groundForce: [400, 300, 200, 100, 100],
        airForce: [500, 400, 300, 200, 150],
        rotation: -180,
        towardsCenter: 75,
        innerRadius: 0.7,
        innerPercent: 100,
        outerPercent: 65,
      })),
    );
    // The hit schedule spans each trap duration within one interval.
    for (const stats of TORNADO_TRAP_LEVELS)
      expect(Math.abs(stats.hits * stats.interval - stats.duration)).toBeLessThan(stats.interval);
    expect(combat.trap.map((row) => row.Level)).toEqual(['1', '2', '3']);
    expect(nativeCampaignIssues(66)).toEqual([]);
    const traps = (index: number) =>
      nativeBuildings(index)
        .filter((b) => b.kind === 'tornadotrap')
        .map((b) => [b.x - 2, b.y - 2, b.level, b.hp]);
    expect(traps(66)).toEqual([
      [22, 17, 1, 1],
      [17, 21, 1, 1],
      [25, 21, 1, 1],
      [20, 25, 1, 1],
    ]);
    expect(BUILDINGS.tornadotrap.size).toBe(1);
    expect(() => tornadoTrapStats(4)).toThrow();
  });

  it('assigns housing force tiers and falls off from the inner to the outer radius', () => {
    expect(
      (
        [
          'swordsman',
          'archer',
          'goblin',
          'wallbreaker',
          'giant',
          'wizard',
          'balloon',
          'healer',
          'dragon',
          'pekka',
        ] as const
      ).map((kind) => tornadoForceTier(kind)),
    ).toEqual([1, 1, 1, 1, 2, 2, 2, 5, 5, 5]);
    expect(tornadoForceTier('swordsman', true)).toBe(5);
    const stats = tornadoTrapStats(3);
    expect([0, 0.7, 2.35, 4, 5].map((r) => tornadoForcePercent(stats, r))).toEqual([
      100, 100, 82.5, 65, 65,
    ]);
    const barbarian = tornadoDrag(stats, 'swordsman', false, 2);
    expect(barbarian.limit).toBeCloseTo((4 * (100 - (35 * 1.3) / 3.3)) / 100, 12);
    expect(Math.hypot(barbarian.inward, barbarian.tangential)).toBeCloseTo(barbarian.limit, 12);
    expect(barbarian.tangential / barbarian.inward).toBeCloseTo((Math.PI * 2) / 0.75, 12);
    // Inside the inner radius the flow only turns, and slow flows are followed exactly.
    expect(tornadoDrag(stats, 'swordsman', false, 0.5)).toMatchObject({
      inward: 0,
      tangential: Math.PI * 0.5,
    });
    const pekka = tornadoDrag(stats, 'pekka', false, 2),
      dragon = tornadoDrag(stats, 'dragon', false, 2),
      king = tornadoDrag(stats, 'swordsman', true, 2);
    expect(pekka.limit).toBeCloseTo(barbarian.limit / 4, 12);
    expect(dragon.limit).toBeCloseTo(pekka.limit * 1.5, 12);
    expect(king).toEqual(pekka);
  });

  for (const kind of ['swordsman', 'dragon', 'healer'] as const)
    it(`conceals a passable trap and triggers for a live ${kind} at exactly three tiles`, () => {
      const trap = trapAt();
      const { m, b, unit } = lateTrapArena([trap]);
      expect(m.visibleBuilding(trap)).toBe(false);
      expect(m.deployBlocked(20.5, 20.5)).toBe(false);
      m.damage(trap, 1e6);
      expect(trap.hp).toBe(1);
      const target = unit(kind, 20.5 + 3.0001, 20.5);
      unit('giant', 20.5, 20.5, { hp: 0 });
      unit('giant', 20.5, 20.5, { spawnedAt: 1 });
      unit('giant', 20.5, 20.5, { ejected: true });
      phase(b, 0.05, 'auras');
      phase(b, 0.05, 'traps');
      expect(b.traps[trap.id]).toBeUndefined();
      // Ordinary trap stepping never handles the late identity.
      target.x = 20.5;
      expect(stepTraps(b, 0.05, () => {})).toBe(false);
      target.x = 23.5;
      phase(b, 0.1, 'traps');
      expect(b.traps[trap.id]).toEqual({
        activatedAt: 0.1,
        resolved: false,
        targetId: target.id,
        x: 20.5,
        y: 20.5,
      });
      expect(m.visibleBuilding(trap)).toBe(true);
      const v = vortex(b);
      expect(v).toEqual({
        trapId: trap.id,
        level: 1,
        x: 20.5,
        y: 20.5,
        activatedAt: 0.1,
        castAt: 0.1 + 8 / 24,
        firstHitAt: 0.1 + 8 / 24 + 0.375,
        endAt: 0.1 + 8 / 24 + 0.375 + 39 * 0.128,
        hits: 0,
        caught: [],
      });
      expect(tornadoTrapPending(b)).toBe(false);
    });

  it('hits every live attacker in the four-tile spell radius once per interval on both layers', () => {
    const trap = trapAt(3);
    const { b, unit } = lateTrapArena([trap]);
    const giant = unit('giant', 20.5 + 3.99, 20.5),
      dragon = unit('dragon', 20.5, 21.5),
      king = unit('swordsman', 21.5, 20.5, { hero: 'king', hp: 2000, maxHp: 2000 }),
      outside = unit('giant', 20.5 - 4.01, 20.5),
      unborn = unit('balloon', 20.5, 19.5);
    const skeleton = spawnSkeleton(b, makeBuilding(8999, 'skeletontrap', 20, 20), 0, 0);
    phase(b, 0, 'traps');
    const v = vortex(b);
    expect(v.hits).toBe(0);
    unborn.spawnedAt = v.firstHitAt + 10 * 0.128 - 0.001;
    const before = [giant.hp, dragon.hp, king.hp, outside.hp, unborn.hp];
    phase(b, v.firstHitAt - 1e-6, 'auras');
    expect(v.hits).toBe(0);
    phase(b, v.firstHitAt, 'auras');
    expect(v.hits).toBe(1);
    expect(v.caught).toEqual([giant.id, dragon.id, king.id]);
    for (let i = 1; i < 55; i++) phase(b, v.firstHitAt + i * 0.128, 'auras');
    expect(v.hits).toBe(55);
    expect([giant.hp, dragon.hp, king.hp, outside.hp, unborn.hp]).toEqual([
      before[0] - 55,
      before[1] - 55,
      before[2] - 55,
      before[3],
      before[4] - 45,
    ]);
    expect(skeleton.hp).toBe(30);
    expect(b.traps[trap.id].resolved).toBe(false);
    phase(b, v.endAt, 'auras');
    expect(b.traps[trap.id].resolved).toBe(true);
    phase(b, 60, 'auras');
    expect(v.hits).toBe(55);
  });

  it('catches up each hit exactly once over a wide step with the then-current positions', () => {
    const { b, unit } = lateTrapArena([trapAt(1)]);
    const u = unit('pekka', 21.5, 20.5);
    phase(b, 0, 'traps');
    const v = vortex(b),
      hp = u.hp;
    phase(b, v.endAt + 5, 'auras', v.endAt + 5);
    expect([v.hits, hp - u.hp]).toEqual([39, 39]);
    phase(b, v.endAt + 6, 'auras');
    expect(hp - u.hp).toBe(39);
  });

  it('carries attackers clockwise toward the inner radius, weaker for heavy tiers and stronger in the air', () => {
    const displacement = (kind: Unit['kind'], dx: number, dy: number) => {
      const { b, unit } = lateTrapArena([trapAt(1)]);
      const u = unit(kind, 20.5 + dx, 20.5 + dy);
      phase(b, 0, 'traps');
      const v = vortex(b);
      phase(b, v.firstHitAt + 0.05, 'auras');
      const stats = tornadoTrapStats(1),
        r = Math.hypot(dx, dy),
        drag = tornadoDrag(stats, kind, false, r);
      const point = tornadoCarryPoint(stats, vortex(b), { kind, x: 20.5 + dx, y: 20.5 + dy }, 0.05);
      expect([u.x, u.y]).toEqual([point.x, point.y]);
      // The rational turn keeps the pulled radius and turns by 2·atan(arc / 2r).
      expect(Math.hypot(u.x - 20.5, u.y - 20.5)).toBeCloseTo(
        Math.max(0.7, r - drag.inward * 0.05),
        12,
      );
      const raw = Math.atan2(u.y - 20.5, u.x - 20.5) - Math.atan2(dy, dx);
      const turned = ((raw + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
      expect(turned).toBeCloseTo(2 * Math.atan((drag.tangential * 0.05) / r / 2), 12);
      expect(Math.abs(turned - (drag.tangential * 0.05) / r)).toBeLessThan(1e-3);
      expect(u.late?.tornadoTrap).toEqual({ until: v.firstHitAt + 0.128 });
      return Math.hypot(u.x - 20.5 - dx, u.y - 20.5 - dy);
    };
    const barbarian = displacement('swordsman', -2, 0),
      pekka = displacement('pekka', -2, 0),
      giant = displacement('giant', -2, 0),
      balloon = displacement('balloon', -2, 0);
    expect(pekka).toBeLessThan(giant);
    expect(giant).toBeLessThan(barbarian);
    expect(balloon).toBeGreaterThan(giant);
    // Clockwise on screen: angle increases from +map X toward +map Y.
    const { b, unit } = lateTrapArena([trapAt(1)]);
    const u = unit('swordsman', 22.5, 20.5);
    phase(b, 0, 'traps');
    phase(b, vortex(b).firstHitAt + 0.05, 'auras');
    expect(u.y).toBeGreaterThan(20.5);
    // Inside the inner radius the unit only turns.
    const inner = unit('swordsman', 20.5, 21);
    phase(b, vortex(b).firstHitAt + 0.128, 'auras');
    phase(b, vortex(b).firstHitAt + 0.178, 'auras');
    expect(distance2D(inner.x - 20.5, inner.y - 20.5)).toBeCloseTo(0.5, 12);
  });

  it('leaves ground attackers stuck against a wall until release while air troops cross it', () => {
    const { b, unit } = lateTrapArena([trapAt(1), makeBuilding(9001, 'wall', 18, 19, 5)]);
    const ground = unit('swordsman', 18.5, 20.02),
      air = unit('balloon', 18.5, 20.02);
    phase(b, 0, 'traps');
    const v = vortex(b);
    for (let t = v.firstHitAt; t < v.endAt; t += 0.05) phase(b, t, 'auras');
    expect([ground.x, ground.y]).toEqual([18.5, 20.02]);
    expect(Math.floor(air.y)).not.toBe(20);
    // Destroyed walls no longer block the vortex.
    b.buildings[1].hp = 0;
    const { b: again, unit: second } = lateTrapArena([
      trapAt(1),
      { ...makeBuilding(9001, 'wall', 18, 19, 5), hp: 0 },
    ]);
    const free = second('swordsman', 18.5, 20.02);
    phase(again, 0, 'traps');
    phase(again, vortex(again).firstHitAt + 0.05, 'auras');
    expect(free.y).toBeLessThan(20);
  });

  it('roots carried attackers in the full simulation without stopping attacks in range, then releases them', () => {
    const trap = trapAt(1);
    const { m, b, unit } = lateTrapArena([trap, makeBuilding(9001, 'builder', 21, 23)]);
    m.discardRecording();
    // The archer's building target stays in range while the vortex turns it; the lone
    // barbarian's far Town Hall target is out of reach, so it only moves with the vortex.
    const archer = unit('archer', 21.5, 22.2, { target: 9001 }),
      barbarian = unit('swordsman', 18, 18.2, { target: 9999 });
    m.step(0.05);
    const v = vortex(b);
    while (b.elapsed < v.firstHitAt + 0.2) m.step(0.05);
    expect(lateUnitRooted(b, archer)).toBe(true);
    expect(lateUnitHeld(b, archer)).toBe(false);
    const hut = b.buildings.find((x) => x.id === 9001)!;
    const hp = hut.hp;
    const clone = structuredClone(b);
    const beforeStep = { x: barbarian.x, y: barbarian.y };
    phase(clone, b.elapsed + 0.05, 'auras');
    m.step(0.05);
    const carried = clone.units.find((x) => x.id === barbarian.id)!;
    expect([barbarian.x, barbarian.y]).toEqual([carried.x, carried.y]);
    expect(Math.hypot(barbarian.x - beforeStep.x, barbarian.y - beforeStep.y)).toBeGreaterThan(0);
    for (let i = 0; i < 40; i++) m.step(0.05);
    expect(hut.hp).toBeLessThan(hp);
    while (b.elapsed < v.endAt) m.step(0.05);
    expect(barbarian.late?.tornadoTrap).toBeUndefined();
    expect(lateUnitRooted(b, barbarian)).toBe(false);
    const released = { x: barbarian.x, y: barbarian.y };
    for (let i = 0; i < 10; i++) m.step(0.05);
    // Released, it walks under its own navigation again.
    expect(Math.hypot(barbarian.x - released.x, barbarian.y - released.y)).toBeGreaterThan(0.2);
    expect(lateCampaignPending(b)).toBe(false);
  });

  it('stops pulses once the battle is finished', () => {
    const { m, b, unit } = lateTrapArena([trapAt(2)]);
    const u = unit('giant', 21, 21);
    phase(b, 0, 'traps');
    m.finishBattle();
    const hp = u.hp;
    phase(b, 10, 'auras');
    expect([vortex(b).hits, u.hp]).toEqual([0, hp]);
  });

  it('rejects Tornado Traps in version 43, practice and unsupported levels', () => {
    const replay = {
      version: 44,
      initial: {
        catalog: 'goblin-v1' as const,
        index: 66,
        practice: false,
        nextId: 100,
        buildings: [trapAt(3, 10, 10, 1), makeBuilding(2, 'townhall', 20, 20)],
        army: {
          swordsman: 1,
          archer: 0,
          giant: 0,
          wizard: 0,
          balloon: 0,
          goblin: 0,
          wallbreaker: 0,
          healer: 0,
          dragon: 0,
          pekka: 0,
        },
        spells: { lightning: 0, heal: 0, rage: 0 },
        spellLevels: { lightning: 1, heal: 1, rage: 1 },
        troopLevels: {
          swordsman: 1,
          archer: 1,
          giant: 1,
          wizard: 1,
          balloon: 1,
          goblin: 1,
          wallbreaker: 1,
          healer: 1,
          dragon: 1,
          pekka: 1,
        },
        availableLoot: { gold: 700000, elixir: 700000, dark: 7000 },
        lootRoom: { gold: 1, elixir: 1, dark: 1 },
      },
      steps: [0.05],
      actions: [
        { type: 'troop' as const, kind: 'swordsman' as const, x: 1, y: 1, step: 0 },
        { type: 'end' as const, step: 1 },
      ],
    };
    expect(validateReplay(replay)).toBe(true);
    for (const change of [
      (v: typeof replay) => {
        v.version = 43;
      },
      (v: typeof replay) => {
        v.initial.buildings[0].level = 4;
      },
      (v: typeof replay) => {
        v.initial.practice = true;
      },
    ]) {
      const v = structuredClone(replay);
      change(v);
      expect(validateReplay(v)).toBe(false);
    }
  });
});
