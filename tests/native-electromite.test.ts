import { hurtUnit } from '../src/game/native-status';
import { expect, it } from 'vitest';
import { emptyArmy } from '../src/game/army';
import { GameModel, makeBuilding, type FX } from '../src/game/model';
import { nativeUnitStats } from '../src/game/native-units';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../src/game/replay';
import {
  spawnNativeUnit,
  stepNativeUnit,
  stepNativeBattle,
  resolveNativeDeath,
  type NativeTroopContext,
} from '../src/game/native-troops';
import type { Defender } from '../src/game/defenders';

function arena(level = 1, version = REPLAY_VERSION) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 1),
    makeBuilding(2, 'cannon', 7, 5, 1),
    makeBuilding(3, 'goldstorage', 10, 5, 15),
    makeBuilding(4, 'builder', 14, 5, 1),
  ];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [];
  const battle = (model.battle = replayBattle(data.initial, version)),
    hits: { id: number; damage: number; at: number }[] = [],
    events: FX[] = [];
  const ctx: NativeTroopContext = {
    battle,
    buildings: battle.buildings,
    buildingsById: new Map(battle.buildings.map((b) => [b.id, b])),
    passableWalls: new Set(),
    nextId: () => model.state.nextId++,
    troopLevel: () => 1,
    damageBuilding: (b, damage, at) => {
      b.hp -= damage;
      hits.push({ id: b.id, damage, at });
    },
    effect: (fx) => events.push(fx),
  };
  const unit = spawnNativeUnit(ctx, 'electromite', level, 5.6, 6.5, 0),
    stats = nativeUnitStats('electromite', level);
  const step = (at: number, factor = 1) => {
    const dt = at - battle.elapsed;
    battle.elapsed = at;
    unit.cooldown -= dt;
    unit.pathAt -= dt;
    stepNativeUnit(ctx, unit, { ...stats, damage: stats.damage * factor }, dt);
  };
  const pending = (at: number) => {
    battle.elapsed = at;
    stepNativeBattle(ctx);
  };
  const defender = (id: number, x: number, y: number, mode: 'ground' | 'air' = 'ground') => {
    const d = {
      kind: 'skeleton',
      id,
      x,
      y,
      mode,
      hp: 2000,
      maxHp: 2000,
      cooldown: 0,
      target: null,
      path: [],
      pathAt: 0,
      attacking: false,
      alerted: true,
      spawnedAt: 0,
    } as Defender;
    (battle.defenders ??= []).push(d);
    return d;
  };
  return { model, battle, ctx, unit, stats, hits, events, step, pending, defender };
}

it.each([1, 8])(
  'Electromite %s spends one cast and chains three buildings with one fourfold bonus',
  (level) => {
    const a = arena(level);
    a.step(0.05);
    expect(a.hits).toEqual([]);
    a.step(0.55);
    expect(a.hits).toEqual([{ id: 2, damage: a.stats.damage * 4, at: 0.55 }]);
    expect(a.unit).toMatchObject({ hp: 0, spent: true, native: { attacks: 1 } });
    a.pending(0.677);
    expect(a.hits).toHaveLength(1);
    a.pending(0.678);
    expect(a.hits[1]).toMatchObject({ id: 3, damage: a.stats.damage * 0.8 * 4 });
    expect(a.hits[1].at).toBeCloseTo(0.678, 8);
    a.pending(0.806);
    expect(a.hits[2]).toMatchObject({ id: 4, damage: a.stats.damage * 0.8 * 0.8 * 4 });
    expect(a.hits[2].at).toBeCloseTo(0.806, 8);
    a.pending(3);
    expect(a.hits).toHaveLength(3);
  },
);
it('Electromite prefers an eligible building over an alerted defender', () => {
  const a = arena(),
    d = a.defender(-1, 6, 6.5);
  a.step(0.05);
  a.step(0.55);
  expect(a.unit.target).toBe(2);
  expect(a.unit.defenderTarget).toBeUndefined();
  expect(d.hp).toBe(2000);
  expect(a.hits[0]?.damage).toBe(224);
});
it('Electromite chains from a building to an air defender and back with captured boosted damage', () => {
  const a = arena(),
    d = a.defender(-1, 9, 6.5, 'air');
  a.step(0.05);
  a.step(0.55, 2.9);
  a.battle.units = [];
  a.pending(0.678);
  expect(d.hp).toBeCloseTo(2000 - 56 * 2.9 * 0.8, 8);
  a.pending(0.806);
  expect(a.hits[1]).toMatchObject({ id: 3 });
  expect(a.hits[1].damage).toBeCloseTo(56 * 2.9 * 0.8 * 0.8 * 4, 8);
});
it('Electromite stuns each reached building for the source tenth of a second', () => {
  const a = arena();
  a.step(0.05);
  a.step(0.55);
  expect(a.battle.defenseStuns[2]).toBeCloseTo(0.65, 8);
  a.pending(0.678);
  expect(a.battle.defenseStuns[3]).toBeCloseTo(0.778, 8);
});
it('version 106 preserves the former building hit without chain or bonus', () => {
  const a = arena(1, 106);
  a.step(0.05);
  a.step(0.55);
  a.pending(1);
  expect(a.hits).toEqual([{ id: 2, damage: 56, at: 0.55 }]);
  expect(a.battle.defenseStuns[2]).toBeUndefined();
});

it.each(['ground', 'air'] as const)(
  'Electromite has one delayed direct cast against a %s defender when no building is eligible',
  (mode) => {
    const a = arena();
    for (const b of a.battle.buildings) b.hp = 0;
    const primary = a.defender(-1, 7.5, 6.5, mode),
      second = a.defender(-2, 9.5, 6.5, mode === 'air' ? 'ground' : 'air'),
      third = a.defender(-3, 11.5, 6.5);
    a.step(0.05);
    expect(primary.hp).toBe(2000);
    a.step(0.54);
    expect(primary.hp).toBe(2000);
    a.step(0.55);
    expect(primary.hp).toBe(1944);
    expect(primary.stunnedUntil).toBeCloseTo(0.65, 8);
    expect(a.unit).toMatchObject({ hp: 0, spent: true, native: { attacks: 1 } });
    a.pending(0.678);
    expect(second.hp).toBeCloseTo(2000 - 56 * 0.8, 8);
    a.pending(0.806);
    expect(third.hp).toBeCloseTo(2000 - 56 * 0.8 * 0.8, 8);
    a.step(2);
    expect(primary.hp).toBe(1944);
    expect(a.battle.projectiles ?? []).toEqual([]);
  },
);
it('Electromite ignores unborn and hidden chain recipients, traps, walls and dead targets', () => {
  const a = arena();
  const future = a.defender(-1, 8.6, 6.5);
  future.spawnedAt = 0.679;
  const hidden = a.defender(-2, 8.7, 6.5);
  hidden.invisibleUntil = 3;
  const dead = a.defender(-3, 8.8, 6.5);
  dead.hp = 0;
  const wall = makeBuilding(10, 'wall', 9, 6, 1),
    trap = makeBuilding(11, 'bomb', 9, 6, 1),
    storage = makeBuilding(12, 'elixirstorage', 9, 5, 1);
  a.battle.buildings.push(wall, trap, storage);
  a.battle.buildingEffects = { [storage.id]: { invisibleUntil: 3 } };
  a.step(0.05);
  a.step(0.55);
  a.pending(0.678);
  expect(a.hits.map((h) => h.id)).toEqual([2, 3]);
  expect([future.hp, hidden.hp, dead.hp]).toEqual([2000, 2000, 0]);
});
it('a chain ends when no unvisited target is inside three tiles', () => {
  const a = arena();
  a.battle.buildings[2].hp = 0;
  a.battle.buildings[3].hp = 0;
  const outside = a.defender(-1, 11.501, 6.5);
  a.step(0.05);
  a.step(0.55);
  a.pending(0.678);
  expect(outside.hp).toBe(2000);
  expect(a.hits).toHaveLength(1);
  expect(a.battle.nativeElectromiteArcs).toEqual([]);
});
it('a late update resolves both remaining hops at their scheduled times', () => {
  const a = arena();
  a.step(0.05);
  a.step(0.55);
  a.pending(1);
  expect(a.hits.map((h) => h.id)).toEqual([2, 3, 4]);
  expect(a.hits[1].at).toBeCloseTo(0.678, 8);
  expect(a.hits[2].at).toBeCloseTo(0.806, 8);
});
it('a consumed final attacker keeps the raid open only until committed arcs resolve', () => {
  const a = arena();
  a.battle.started = true;
  a.battle.remaining = emptyArmy();
  a.step(0.05);
  a.step(0.55);
  a.model.step(0.05);
  expect(a.battle.finished).toBe(false);
  while (!a.battle.finished && a.battle.elapsed < 1) a.model.step(0.05);
  expect(a.battle.finished).toBe(true);
  expect(a.battle.nativeElectromiteArcs).toEqual([]);
});
it('source trap and Castle-pull immunity remain on a live Electromite', async () => {
  const { initializeGarrison, stepGarrisonReleases } = await import('../src/game/garrison-release');
  const { unitTriggersTraps } = await import('../src/game/native-status');
  const a = arena();
  a.unit.x = 11.5;
  a.unit.y = 11.5;
  a.battle.buildings.push(makeBuilding(10, 'clancastle', 10, 10, 1));
  a.battle.garrisons = [
    initializeGarrison({
      castleId: 10,
      mode: 'guard',
      troops: [{ kind: 'archer', level: 9, count: 1 }],
    }),
  ];
  a.battle.elapsed = 0.5;
  stepGarrisonReleases(a.battle);
  expect(a.battle.garrisons[0].released).toBe(0);
  expect(unitTriggersTraps(a.unit)).toBe(false);
});

it.each([
  [1, 7],
  [8, 14],
])(
  'Super Yeti %s releases a matching-tier Electromite per 400 lost HP up to %s',
  (level, limit) => {
    const a = arena(),
      parent = spawnNativeUnit(a.ctx, 'superyeti', level, 5.6, 20, 0),
      stats = nativeUnitStats('superyeti', level);
    expect(stats.spawnWhenDamaged).toBe(0);
    const children = () =>
      a.battle.units.filter((u) => u.kind === 'electromite' && u.native?.owner === parent.id);
    const hit = (damage: number) => {
      hurtUnit(a.battle, parent, damage, a.battle.elapsed);
      a.battle.elapsed += 0.05;
      stepNativeUnit(a.ctx, parent, stats, 0.05);
    };
    hit(399);
    expect(children()).toHaveLength(0);
    hit(1);
    expect(children()).toHaveLength(1);
    hit(400 * (limit + 1));
    expect(parent.hp).toBeGreaterThan(0);
    expect(children()).toHaveLength(limit);
    expect(children().every((c) => c.level === level)).toBe(true);
  },
);
it.each([106, 107])(
  'version %s releases only the remaining Super Yeti children on death',
  (version) => {
    const a = arena(1, version),
      parent = spawnNativeUnit(a.ctx, 'superyeti', 1, 5.6, 20, 0),
      stats = nativeUnitStats('superyeti', 1);
    const children = () =>
      a.battle.units.filter((u) => u.kind === 'electromite' && u.native?.owner === parent.id);
    hurtUnit(a.battle, parent, 400, 0);
    a.battle.elapsed = 0.05;
    stepNativeUnit(a.ctx, parent, stats, 0.05);
    expect(children()).toHaveLength(version >= 107 ? 1 : 0);
    hurtUnit(a.battle, parent, parent.hp, 0.05);
    resolveNativeDeath(a.ctx, parent);
    expect(children()).toHaveLength(7);
  },
);
it('version 106 preserves repeated direct Electromite defender hits', () => {
  const a = arena(1, 106);
  for (const b of a.battle.buildings) b.hp = 0;
  const d = a.defender(-1, 7.5, 6.5);
  a.step(0.05);
  expect(d.hp).toBe(1944);
  a.step(1.05);
  expect(d.hp).toBe(1888);
  expect(a.unit.hp).toBeGreaterThan(0);
  expect(a.unit.spent).toBeUndefined();
});
