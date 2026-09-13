import { describe, expect, it } from 'vitest';
import { GameModel, makeBuilding, makeNpcBuilding, type Battle } from '../src/game/model';
import { spawnSkeleton } from '../src/game/defenders';
import { nativeBuildings, nativeCampaignIssues } from '../src/game/native-campaign';
import { validateReplay } from '../src/game/replay';
import { validateSave } from '../src/game/save';
import { lateUnitFrozen, lateUnitHeld, lateUnitTimeLost } from '../src/game/late-campaign';
import { NPC_BUILDINGS } from '../src/game/npc-buildings';
import {
  FREEZE_TRAP_READY,
  freezeTimeLost,
  freezeTrapPending,
  freezeUnit,
  isFrozen,
  stepFreezeTrap,
  type FreezeCast,
} from '../src/game/freeze-trap';
import { FREEZE_SPELL, FREEZE_TRAP, freezeDuration } from '../src/game/freeze-trap-stats';
import { stepTornadoTrap } from '../src/game/tornado-trap';
import { lateTrapArena } from './fixtures/late-trap-battle';

const trapAt = (x = 20, y = 20, id = 9000) => makeNpcBuilding(id, 'freeze-trap', x, y);
const phase = (b: Battle, time: number, which: 'traps' | 'auras') => {
  b.elapsed = time;
  stepFreezeTrap({ battle: b, dt: 0.05, phase: which, effect: () => {}, damageBuilding: () => {} });
};
const cast = (b: Battle, id = 9000) => b.late!.freezeTrap!.casts[id] as FreezeCast;

describe('campaign Goblin Freeze Trap', () => {
  it('uses the pinned campaign identity, spell fields and every native placement', () => {
    expect(FREEZE_TRAP_READY).toBe(true);
    expect(FREEZE_TRAP).toEqual({
      level: 1,
      trigger: 2,
      damageRadius: 3,
      duration: 5,
      minHousing: 1,
      air: true,
      ground: true,
      delay: 14 / 24,
    });
    expect(FREEZE_SPELL).toEqual({
      radius: 3.5,
      hitTime: 0.01,
      hits: 1,
      freeze: 5,
      outerFreeze: 4.5,
    });
    expect(NPC_BUILDINGS['freeze-trap']).toMatchObject({
      globalId: 12000018,
      kind: 'giantbomb',
      hp: [1],
      size: 2,
    });
    expect(nativeCampaignIssues(64)).toEqual([]);
    const traps = nativeBuildings(64).filter((b) => b.npc === 'freeze-trap');
    expect(traps.map((b) => [b.x - 2, b.y - 2, b.level, b.hp, b.kind])).toEqual(
      [
        [17, 30],
        [23, 30],
        [32, 21],
        [32, 17],
        [23, 8],
        [17, 8],
        [8, 16],
        [8, 20],
        [18, 22],
        [22, 22],
        [22, 16],
        [18, 16],
      ].map(([x, y]) => [x, y, 1, 1, 'giantbomb']),
    );
    expect([0, 1.75, 3.5, 4].map(freezeDuration)).toEqual([5, 4.875, 4.5, 4.5]);
  });

  for (const kind of ['giant', 'dragon', 'healer'] as const)
    it(`conceals a passable trap and triggers for a live ${kind} at exactly two tiles`, () => {
      const trap = trapAt();
      const { m, b, unit } = lateTrapArena([trap], 64);
      expect(m.visibleBuilding(trap)).toBe(false);
      expect(m.deployBlocked(21, 21)).toBe(false);
      m.damage(trap, 1e6);
      expect(trap.hp).toBe(1);
      const target = unit(kind, 21 + 2.0001, 21);
      unit('giant', 21, 21, { hp: 0 });
      unit('giant', 21, 21, { spawnedAt: 1 });
      unit('giant', 21, 21, { ejected: true });
      phase(b, 0.05, 'traps');
      expect(b.traps[trap.id]).toBeUndefined();
      target.x = 23;
      phase(b, 0.1, 'traps');
      expect(b.traps[trap.id]).toEqual({
        activatedAt: 0.1,
        resolved: false,
        targetId: target.id,
        x: 21,
        y: 21,
      });
      expect(cast(b)).toEqual({
        trapId: trap.id,
        x: 21,
        y: 21,
        activatedAt: 0.1,
        castAt: 0.1 + 14 / 24,
        hitAt: 0.1 + 14 / 24 + 0.01,
        hit: false,
        frozen: [],
      });
      expect(m.visibleBuilding(trap)).toBe(true);
      expect(freezeTrapPending(b)).toBe(false);
    });

  it('freezes live attackers inside the spell radius once, with the distance handoff, and never defenders', () => {
    const trap = trapAt();
    const { b, unit } = lateTrapArena([trap], 64);
    const center = unit('giant', 21, 21, {
        target: 9999,
        path: [{ x: 30, y: 30 }],
        pathAt: 1,
        attacking: true,
      }),
      edge = unit('dragon', 21 + 3.5, 21),
      king = unit('swordsman', 21, 22.75, { hero: 'king' }),
      outside = unit('balloon', 21, 21 + 3.5001),
      unborn = unit('swordsman', 21, 21);
    const skeleton = spawnSkeleton(b, makeBuilding(8999, 'skeletontrap', 20, 20), 0, 0);
    phase(b, 0, 'traps');
    const c = cast(b);
    unborn.spawnedAt = c.hitAt + 0.001;
    phase(b, c.hitAt - 1e-6, 'auras');
    expect(c.hit).toBe(false);
    phase(b, c.hitAt + 0.02, 'auras');
    expect(c.hit).toBe(true);
    expect(c.frozen).toEqual([center.id, edge.id, king.id]);
    expect(center.late?.freezeTrap).toEqual({ since: c.hitAt, until: c.hitAt + 5, lost: 0 });
    expect(edge.late!.freezeTrap!.until).toBeCloseTo(c.hitAt + 4.5, 12);
    expect(king.late!.freezeTrap!.until).toBeCloseTo(c.hitAt + 4.875, 12);
    expect([outside.late, unborn.late, (skeleton as { late?: unknown }).late]).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect([center.target, center.path, center.pathAt, center.attacking]).toEqual([
      null,
      [],
      0,
      false,
    ]);
    expect(b.traps[trap.id].resolved).toBe(true);
    // A troop that walks in afterwards is not frozen: the spell has exactly one hit.
    outside.y = 21;
    phase(b, c.hitAt + 1, 'auras');
    expect(outside.late).toBeUndefined();
  });

  it('holds frozen attackers in the full simulation, then lets them move and attack again', () => {
    const { m, b, unit } = lateTrapArena([trapAt(), makeBuilding(9001, 'builder', 23, 17)], 64);
    const giant = unit('giant', 22.4, 21, { cooldown: 0.5 }),
      balloon = unit('balloon', 21, 22.5, { cooldown: 0.5 });
    m.step(0.05);
    const c = cast(b);
    while (b.elapsed < c.hitAt) m.step(0.05);
    expect(lateUnitHeld(b, giant)).toBe(true);
    const frozen = [giant.x, giant.y, giant.cooldown, balloon.x, balloon.y, balloon.cooldown];
    for (let i = 0; i < 20; i++) m.step(0.05);
    expect([giant.x, giant.y, giant.cooldown, balloon.x, balloon.y, balloon.cooldown]).toEqual(
      frozen,
    );
    expect([giant.attacking, balloon.attacking]).toEqual([false, false]);
    expect(lateUnitFrozen(giant, b.elapsed)).toBe(true);
    expect(lateUnitTimeLost(giant, b.elapsed)).toBeCloseTo(b.elapsed - c.hitAt, 12);
    while (isFrozen(giant, b.elapsed) || isFrozen(balloon, b.elapsed)) m.step(0.05);
    const hp = b.buildings[1].hp;
    for (let i = 0; i < 80; i++) m.step(0.05);
    expect(Math.hypot(balloon.x - frozen[3], balloon.y - frozen[4])).toBeGreaterThan(0.1);
    expect(b.buildings[1].hp).toBeLessThan(hp);
  });

  it('keeps the later expiry for overlaps and continuous presentation clocks across refreezes', () => {
    const { unit } = lateTrapArena([], 64);
    const u = unit('giant', 10, 10);
    freezeUnit(u, 1, 6);
    freezeUnit(u, 2, 5);
    expect(u.late!.freezeTrap).toEqual({ since: 1, until: 6, lost: 0 });
    freezeUnit(u, 4, 8.5);
    expect(u.late!.freezeTrap).toEqual({ since: 1, until: 8.5, lost: 0 });
    expect([freezeTimeLost(u, 0.5), freezeTimeLost(u, 3), freezeTimeLost(u, 20)]).toEqual([
      0, 2, 7.5,
    ]);
    freezeUnit(u, 10, 15);
    expect(u.late!.freezeTrap).toEqual({ since: 10, until: 15, lost: 7.5 });
    expect([isFrozen(u, 9.9), isFrozen(u, 10), isFrozen(u, 15)]).toEqual([false, true, false]);
    expect(freezeTimeLost(u, 12)).toBe(9.5);
  });

  it('lets a Tornado Trap keep carrying a frozen attacker', () => {
    const { b, unit } = lateTrapArena(
      [trapAt(), { ...makeBuilding(9002, 'tornadotrap', 20, 23, 1), hp: 1, maxHp: 1 }],
      81,
    );
    const u = unit('swordsman', 21.3, 22);
    const both = (time: number, which: 'traps' | 'auras') => {
      b.elapsed = time;
      const context = {
        battle: b,
        dt: 0.05,
        phase: which,
        effect: () => {},
        damageBuilding: () => {},
      };
      stepTornadoTrap(context);
      stepFreezeTrap(context);
    };
    both(0, 'traps');
    both(1, 'auras');
    expect(isFrozen(u, 1)).toBe(true);
    const before = [u.x, u.y];
    both(1.05, 'auras');
    expect([u.x, u.y]).not.toEqual(before);
  });

  it('stops before the hit once the battle is finished', () => {
    const { m, b, unit } = lateTrapArena([trapAt()], 64);
    const u = unit('giant', 21, 21);
    phase(b, 0, 'traps');
    m.finishBattle();
    phase(b, 5, 'auras');
    expect([cast(b).hit, u.late]).toEqual([false, undefined]);
  });

  it('rejects campaign identity in version 43, practice, other archetypes, levels and home saves', () => {
    const replay = {
      version: 44,
      initial: {
        catalog: 'goblin-v1' as const,
        index: 64,
        practice: false,
        nextId: 100,
        buildings: [trapAt(10, 10, 1), makeBuilding(2, 'townhall', 20, 20)],
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
        availableLoot: { gold: 650000, elixir: 650000, dark: 6500 },
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
        v.initial.practice = true;
      },
      (v: typeof replay) => {
        v.initial.buildings[0].level = 2;
      },
      (v: typeof replay) => {
        v.initial.buildings[0].kind = 'bomb';
      },
    ]) {
      const v = structuredClone(replay);
      change(v);
      expect(validateReplay(v)).toBe(false);
    }
    const home = new GameModel();
    home.state.buildings.push(makeNpcBuilding(home.state.nextId++, 'freeze-trap', 2, 2));
    expect(validateSave(home.state)).toBe(false);
  });
});
