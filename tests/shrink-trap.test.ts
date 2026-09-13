import { describe, expect, it } from 'vitest';
import source from '../reference/shrink-trap/native.json';
import combat from '../reference/shrink-trap/combat.json';
import { GameModel, makeBuilding, makeNpcBuilding, type Unit } from '../src/game/model';
import {
  SHRINK_TRAP,
  SHRINK_SPELL,
  applyShrink,
  isShrunk,
  shrinkStepTime,
} from '../src/game/shrink-trap';
import { battleTrapStats, stepTraps } from '../src/game/traps';
import { BUILDINGS, trapDamage } from '../src/game/data';
import { spawnSkeleton } from '../src/game/defenders';
import { nativeBuildings, nativeCampaignIssues } from '../src/game/native-campaign';
import { validateSave } from '../src/game/save';
import { validateReplay } from '../src/game/replay';

function arena() {
  const m = new GameModel();
  m.startBattle(0);
  m.discardRecording();
  const b = m.battle!,
    trap = makeNpcBuilding(9000, 'shrink-trap', 10, 10);
  b.buildings = [trap, makeBuilding(9001, 'townhall', 30, 30)];
  b.started = true;
  const unit = (x = 11, kind: Unit['kind'] = 'giant') => {
    const u: Unit = {
      id: 10000 + b.units.length,
      kind,
      x,
      y: 11,
      hp: 900,
      maxHp: 1000,
      cooldown: 100,
      target: null,
      path: [],
      pathAt: 0,
      attacking: false,
    };
    b.units.push(u);
    return u;
  };
  const step = (time = b.elapsed) => {
    b.elapsed = time;
    return stepTraps(b, 0.05, m.onEffect);
  };
  return { m, b, trap, unit, step };
}

describe('campaign Shrink Trap', () => {
  it('uses the original NPC identity, positions, size and separate trigger/spell radii', () => {
    expect(combat.trap).toEqual(source.traps.ShrinkTrap_SinglePlayer[0]);
    expect(combat.spell).toEqual(source.spells.ShrinkTrap[0]);
    expect(SHRINK_TRAP).toEqual({
      damage: 0,
      trigger: 2,
      radius: 3,
      targets: 'both',
      minHousing: 1,
      delay: 14 / 24,
    });
    expect(SHRINK_SPELL).toEqual({
      radius: 4,
      charge: 0.3,
      hit: 1,
      interval: 0.25,
      hits: 75,
      duration: 20,
      linger: 7,
      speed: 0.5,
    });
    expect(nativeCampaignIssues(54)).toEqual([]);
    const traps = nativeBuildings(54).filter((v) => v.npc === 'shrink-trap');
    expect(traps).toHaveLength(8);
    expect(traps.every((v) => v.kind === 'giantbomb' && v.level === 1 && v.hp === 1)).toBe(true);
    expect(traps.map((v) => [v.x - 2, v.y - 2, v.level])).toEqual(
      // Exact pinned campaign positions; no radius-driven placement adjustment.
      [
        [9, 26, 1],
        [9, 21, 1],
        [9, 16, 1],
        [21, 9, 1],
        [33, 16, 1],
        [33, 21, 1],
        [33, 26, 1],
        [22, 33, 1],
      ],
    );
    expect(trapDamage('giantbomb', 1)).toBe(175);
    expect(Object.hasOwn(BUILDINGS, 'shrink-trap')).toBe(false);
  });

  for (const kind of ['giant', 'dragon', 'healer'] as const)
    it(`conceals a passable trap and triggers for a live ${kind} at exactly two tiles`, () => {
      const { m, b, trap, unit, step } = arena();
      expect(m.visibleBuilding(trap)).toBe(false);
      expect(m.deployBlocked(11, 11)).toBe(false);
      m.damage(trap, 1e6);
      expect(trap.hp).toBe(1);
      const target = unit(13.0001, kind),
        dead = unit(),
        unborn = unit(),
        ejected = unit();
      dead.hp = 0;
      unborn.spawnedAt = 1;
      ejected.ejected = true;
      step();
      expect(b.traps[trap.id]).toBeUndefined();
      target.x = 13;
      step();
      expect(b.traps[trap.id]).toMatchObject({
        x: 11,
        y: 11,
        targetId: target.id,
        shrink: { pulses: 0 },
      });
      expect(m.visibleBuilding(trap)).toBe(true);
      expect(battleTrapStats(trap)).toMatchObject(SHRINK_TRAP);
      expect(target.shrink).toBeUndefined();
    });

  it('pulses the fixed four-tile area 75 times, preserves HP and excludes defenders and future spawns', () => {
    const { m, b, trap, unit, step } = arena();
    const trigger = unit(),
      edge = unit(15, 'dragon'),
      outside = unit(15.00001),
      unborn = unit();
    const defender = spawnSkeleton(b, makeBuilding(8999, 'skeletontrap', 10, 10), 0, 0);
    const effects: string[] = [];
    m.onEffect = (fx) => effects.push(fx.type);
    step(0.05);
    const state = b.traps[trap.id],
      s = state.shrink!,
      first = s.deployAt + 1;
    expect(s.castAt).toBeCloseTo(0.05 + 14 / 24, 12);
    expect(s.deployAt).toBeCloseTo(0.05 + 14 / 24 + 0.3, 12);
    unborn.spawnedAt = first + 0.001;
    trigger.hp = 0;
    trigger.x = 30;
    step(first - 0.000001);
    expect(edge.shrink).toBeUndefined();
    step(first);
    expect(edge.shrink).toEqual({ since: first, until: first + 7, timeLost: 0 });
    expect([outside.shrink, unborn.shrink]).toEqual([undefined, undefined]);
    expect(defender.hp).toBe(30);
    const original = structuredClone(edge);
    step(first);
    expect(edge).toEqual(original);
    for (let i = 1; i < 75; i++) step(first + i * 0.25);
    expect(s.pulses).toBe(75);
    expect(edge.shrink!.until).toBe(first + 74 * 0.25 + 7);
    expect([edge.hp, edge.maxHp, outside.hp, unborn.hp]).toEqual([900, 1000, 900, 900]);
    expect(state.resolved).toBe(false);
    step(s.endAt);
    expect(state.resolved).toBe(true);
    expect(effects).toEqual([]);
    expect(isShrunk(edge, edge.shrink!.until)).toBe(false);
    step(100);
    expect([s.pulses, edge.hp, edge.maxHp]).toEqual([75, 900, 1000]);
  });

  it('refreshes without stacking, recovers after leaving and survives re-entry without changing health', () => {
    const { b, trap, unit, step } = arena(),
      u = unit();
    step();
    const first = b.traps[trap.id].shrink!.deployAt + 1;
    step(first);
    u.x = 30;
    step(first + 7);
    expect(isShrunk(u, first + 7)).toBe(false);
    u.x = 11;
    step(first + 7.25);
    expect(u.shrink!.since).toBe(first + 7.25);
    applyShrink(u, first + 7.5);
    applyShrink(u, first + 7.25);
    expect(u.shrink!.until).toBe(first + 14.5);
    expect(shrinkStepTime(u, first + 8, 0.05)).toBeCloseTo(0.025, 12);
    u.hp -= 200;
    u.hp += 25;
    expect(isShrunk(u, first + 15)).toBe(false);
    expect([u.hp, u.maxHp]).toEqual([725, 1000]);
  });

  it('catches up each pulse once, retains spell allegiance after trigger death and stops after battle end', () => {
    const { m, b, trap, unit, step } = arena(),
      u = unit();
    step();
    const s = b.traps[trap.id].shrink!;
    u.hp = 0;
    const late = unit(11, 'healer');
    late.spawnedAt = s.deployAt + 19.49;
    step(s.endAt + 1);
    expect(s.pulses).toBe(75);
    expect(late.shrink!.since).toBe(s.deployAt + 19.5);
    expect(late.hp).toBe(900);
    step(30);
    expect(s.pulses).toBe(75);
    const other = makeNpcBuilding(9002, 'shrink-trap', 10, 10);
    b.buildings.push(other);
    step();
    expect(b.traps[other.id].shrink!.pulses).toBe(0);
    m.finishBattle();
    expect(step(60)).toBe(false);
    expect(b.traps[other.id].shrink!.pulses).toBe(0);
  });

  it('integrates partial expiry without slowing path refresh or increasing damage per attack', () => {
    const { m, b, unit } = arena();
    b.buildings = [makeBuilding(9001, 'townhall', 30, 30)];
    const u = unit(28, 'dragon');
    u.cooldown = 1;
    u.pathAt = 1;
    u.target = 9001;
    applyShrink(u, 0);
    b.elapsed = 6.95;
    expect(shrinkStepTime(u, 7.05, 0.1)).toBeCloseTo(0.075, 12);
    m.step(0.1);
    expect(u.cooldown).toBeCloseTo(0.925, 12);
    expect(u.pathAt).toBeCloseTo(0.9, 12);
    expect(u.shrink!.timeLost).toBeCloseTo(0.025, 12);
    expect([u.hp, u.maxHp]).toEqual([900, 1000]);
  });

  for (const kind of [
    'swordsman',
    'archer',
    'giant',
    'balloon',
    'wizard',
    'dragon',
    'pekka',
  ] as const)
    it(`halves ${kind} movement and attack-clock progress while preserving damage and HP`, () => {
      const normal = arena(),
        slowed = arena();
      const setup = (a: ReturnType<typeof arena>, shrink: boolean) => {
        a.b.buildings = [makeBuilding(9001, 'townhall', 30, 30)];
        const u = a.unit(15, kind);
        u.y = 30;
        u.cooldown = 1;
        if (shrink) applyShrink(u, 0);
        a.m.step(0.05);
        return u;
      };
      const a = setup(normal, false),
        b = setup(slowed, true);
      expect(Math.hypot(b.x - 15, b.y - 30)).toBeCloseTo(Math.hypot(a.x - 15, a.y - 30) / 2, 10);
      expect([a.cooldown, b.cooldown]).toEqual([0.95, 0.975]);
      expect([a.hp, b.hp, a.maxHp, b.maxHp]).toEqual([900, 900, 1000, 1000]);
    });

  it('rejects campaign trap identity in home saves, practice and older or mismatched replay entities', () => {
    const m = new GameModel();
    m.startBattle(0);
    m.deploy(1, 1);
    m.finishBattle();
    const r = m.state.raidLog![0].replay!;
    r.initial.buildings.push(makeNpcBuilding(9000, 'shrink-trap', 10, 10));
    expect(validateReplay(r)).toBe(true);
    for (const change of [
      (v: typeof r) => {
        v.version = 33;
      },
      (v: typeof r) => {
        v.initial.practice = true;
      },
      (v: typeof r) => {
        v.initial.buildings.at(-1)!.level = 2;
      },
      (v: typeof r) => {
        v.initial.buildings.at(-1)!.kind = 'bomb';
      },
    ]) {
      const v = structuredClone(r);
      change(v);
      expect(validateReplay(v)).toBe(false);
    }
    const home = new GameModel();
    home.state.buildings.push(makeNpcBuilding(home.state.nextId++, 'shrink-trap', 2, 2));
    expect(validateSave(home.state)).toBe(false);
  });
});
