import {
  BattleSoundLog,
  troopSoundCues,
  effectCue,
  troopSoundEffect,
} from '../src/game/troop-sounds';
import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type FX } from '../src/game/model';
import { emptyArmy } from '../src/game/army';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../src/game/replay';
import { nativeUnitStats } from '../src/game/native-units';
import {
  spawnNativeUnit,
  stepNativeUnit,
  stepNativeBattle,
  resolveNativeImpact,
  type NativeTroopContext,
} from '../src/game/native-troops';
import { stepProjectiles } from '../src/game/projectiles';
import type { Defender } from '../src/game/defenders';

function arena(level = 1, version = REPLAY_VERSION, mode: 'ground' | 'air' = 'ground') {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.nextId = 1000;
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 1)];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [];
  const battle = (model.battle = replayBattle(data.initial, version)),
    events: FX[] = [],
    hits: { id: number; damage: number; at: number }[] = [];
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
  const unit = spawnNativeUnit(ctx, 'meteorgolem', level, 5, 6.5, 0),
    stats = nativeUnitStats('meteorgolem', level),
    mite = nativeUnitStats('meteormite', level);
  const defender = (id: number, x: number, y: number, mode: 'ground' | 'air' = 'ground') => {
    const d = {
      kind: 'skeleton',
      id,
      x,
      y,
      mode,
      hp: 4000,
      maxHp: 4000,
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
  const primary = defender(-1, 9.8, 6.5, mode);
  const step = (at: number, factor = 1) => {
    const dt = at - battle.elapsed;
    battle.elapsed = at;
    unit.cooldown -= dt;
    unit.pathAt -= dt;
    stepNativeUnit(ctx, unit, { ...stats, damage: stats.damage * factor }, dt);
  };
  const impact = (at: number) => {
    battle.elapsed = at;
    stepNativeBattle(ctx);
    stepProjectiles(battle, ctx.damageBuilding, ctx.effect, (p) => resolveNativeImpact(ctx, p));
  };
  return { model, battle, ctx, events, hits, unit, stats, mite, primary, defender, step, impact };
}
it.each([
  [1, 'ground'],
  [2, 'air'],
  [3, 'ground'],
] as const)(
  'Meteor Golem %s throws its native body at a %s defender and lands one matching half',
  (level, mode) => {
    const a = arena(level, undefined, mode);
    a.step(0.05);
    const p = a.battle.projectiles![0];
    expect(p.weapon).toBe('native');
    expect(p.native).toMatchObject({ kind: 'meteorgolem', level, name: a.stats.projectile });
    expect(p.impact - p.launched).toBeCloseTo(4.8 / 8, 8);
    expect(a.unit).toMatchObject({ kind: 'meteormite', level, hp: a.mite.hp, maxHp: a.mite.hp });
    expect(a.primary.hp).toBe(4000);
    expect(a.battle.nativePendingSpawns).toHaveLength(1);
    expect(a.battle.nativePendingSpawns![0]).toMatchObject({
      at: p.impact,
      kind: 'meteormite',
      level,
      hp: a.mite.hp,
      x: 9.8,
      y: 6.5,
    });
    a.impact(p.impact - 0.001);
    expect(a.battle.units.filter((u) => u.kind === 'meteormite')).toHaveLength(1);
    a.impact(p.impact);
    expect(a.primary.hp).toBe(4000 - a.stats.damage);
    expect(a.battle.units.filter((u) => u.kind === 'meteormite')).toHaveLength(2);
  },
);
it.each([1, 2, 3])(
  'Meteor Golem %s rounds both halves from captured current HP at launch',
  (level) => {
    const a = arena(level);
    a.unit.hp = 2468;
    a.step(0.05);
    const p = a.battle.projectiles![0],
      bucket = a.mite.hp / 100,
      half = Math.floor(1234 / bucket) * bucket;
    expect(a.unit.hp).toBe(half);
    expect(a.battle.nativePendingSpawns![0].hp).toBe(half);
    a.unit.hp = 0;
    a.impact(p.impact);
    expect(a.battle.units.find((u) => u.id !== a.unit.id && u.kind === 'meteormite')?.hp).toBe(
      half,
    );
  },
);
it('a sub-one-percent Meteor Golem leaves only one thrown 1-HP half', () => {
  const a = arena();
  a.unit.hp = 100;
  a.step(0.05);
  const p = a.battle.projectiles![0];
  expect(a.unit).toMatchObject({ kind: 'meteorgolem', hp: 0, spent: true });
  a.impact(p.impact);
  expect(a.battle.units.filter((u) => u.kind === 'meteormite')).toMatchObject([
    { hp: 1, maxHp: 7250 },
  ]);
});
it.each(['ground', 'air'] as const)(
  'a %s primary is hit once and the one-tile impact reaches both defender layers',
  (mode) => {
    const a = arena(1, undefined, mode),
      ground = a.defender(-2, 10.3, 6.5),
      air = a.defender(-3, 9.8, 7, 'air'),
      outside = a.defender(-4, 10.801, 6.5, 'air');
    a.step(0.05);
    const p = a.battle.projectiles![0],
      future = a.defender(-5, 9.8, 6.5);
    future.spawnedAt = p.impact + 0.01;
    a.impact(p.impact);
    expect([a.primary.hp, ground.hp, air.hp]).toEqual([3520, 3520, 3520]);
    expect(outside.hp).toBe(4000);
    expect(future.hp).toBe(4000);
  },
);
it('a committed Meteor Golem throw retains outgoing damage after the staying half dies', () => {
  const a = arena();
  a.step(0.05, 2.9);
  const p = a.battle.projectiles![0];
  a.battle.units = [];
  a.impact(p.impact);
  expect(a.primary.hp).toBeCloseTo(4000 - 480 * 2.9, 8);
});
it('a cloned Meteor Golem splits without refreshing either half’s deadline', () => {
  const a = arena();
  a.unit.native!.cloneUntil = 5;
  a.unit.summoned = true;
  a.step(0.05);
  const p = a.battle.projectiles![0];
  expect(a.unit).toMatchObject({ kind: 'meteormite', native: { cloneUntil: 5 } });
  a.impact(p.impact);
  const halves = a.battle.units.filter((u) => u.kind === 'meteormite');
  expect(halves).toHaveLength(2);
  expect(halves.every((u) => u.native?.cloneUntil === 5 && u.summoned)).toBe(true);
  a.impact(5);
  expect(halves.every((u) => u.hp === 0 && u.spent && u.defeatedAt === 5)).toBe(true);
});
it('a thrown clone that expires in flight still hits but never creates an expired living half', () => {
  const a = arena();
  a.unit.native!.cloneUntil = 0.2;
  a.unit.summoned = true;
  a.step(0.05);
  const p = a.battle.projectiles![0];
  a.impact(p.impact);
  expect(a.primary.hp).toBe(3520);
  expect(a.battle.units.filter((u) => u.kind === 'meteormite')).toHaveLength(1);
  expect(a.unit.hp).toBe(0);
});
it('version 107 retains the former generic defender projectile and unsplit caster', () => {
  const a = arena(1, 107);
  a.step(0.05);
  expect(a.battle.projectiles![0]).toMatchObject({ weapon: 'arrow' });
  expect(a.battle.projectiles![0].native).toBeUndefined();
  expect(a.unit.kind).toBe('meteorgolem');
  expect(a.battle.nativePendingSpawns).toBeUndefined();
});

it.each([
  [108, 0.01],
  [107, 0.12],
])('version %s preserves its short building throw timing', (version, floor) => {
  const a = arena(1, version);
  a.primary.hp = 0;
  const b = makeBuilding(2, 'goldstorage', 7, 5, 15);
  a.battle.buildings.push(b);
  a.ctx.buildingsById.set(b.id, b);
  a.unit.x = 8.45;
  a.step(0.05);
  const p = a.battle.projectiles![0];
  expect(p.impact - p.launched).toBeCloseTo(floor, 8);
  if (version >= 108) expect(a.battle.nativePendingSpawns![0].at).toBe(p.impact);
  else expect(a.battle.nativePendingSpawns![0].at).toBeLessThan(p.impact);
});
it('a blocker on the defender route uses the original Wall throw and fivefold damage', () => {
  const a = arena();
  a.primary.x = 17.8;
  const wall = makeBuilding(2, 'wall', 7, 6, 10);
  a.battle.buildings.push(wall);
  a.ctx.buildingsById.set(wall.id, wall);
  a.unit.defenderTarget = a.primary.id;
  a.unit.path = [{ x: 7.5, y: 6.5 }];
  a.unit.pathAt = 1;
  a.step(0.05);
  const p = a.battle.projectiles![0];
  expect(p).toMatchObject({
    weapon: 'native',
    targetBuilding: true,
    targetId: wall.id,
    native: { kind: 'meteorgolem' },
  });
  expect(a.unit.kind).toBe('meteormite');
  a.impact(p.impact);
  expect(a.hits).toContainEqual({ id: wall.id, damage: 2400, at: p.impact });
});
it('a building-primary throw splashes air defenders and applies the Wall bonus separately', () => {
  const a = arena();
  a.primary.hp = 0;
  const storage = makeBuilding(2, 'goldstorage', 7, 5, 15),
    wall = makeBuilding(3, 'wall', 9, 6, 10);
  a.battle.buildings.push(storage, wall);
  for (const b of [storage, wall]) a.ctx.buildingsById.set(b.id, b);
  const air = a.defender(-2, 8.5, 7, 'air');
  a.step(0.05);
  const p = a.battle.projectiles![0];
  a.impact(p.impact);
  expect(a.hits).toEqual([
    { id: 2, damage: 480, at: p.impact },
    { id: 3, damage: 2400, at: p.impact },
  ]);
  expect(air.hp).toBe(3520);
});
it('cloned halves cannot merge and the cast/hit effects retain the original source and times', () => {
  const a = arena();
  a.unit.native!.cloneUntil = 5;
  a.unit.summoned = true;
  a.step(0.05);
  const p = a.battle.projectiles![0];
  a.impact(p.impact);
  for (const b of a.battle.buildings) b.hp = 0;
  a.primary.hp = 0;
  a.battle.elapsed = 3;
  for (const u of a.battle.units) {
    u.native!.lastAttackAt = -10;
    stepNativeUnit(a.ctx, u, nativeUnitStats(u.kind, u.level ?? 1), 0.05);
  }
  expect(a.battle.units.filter((u) => u.hp > 0 && u.kind === 'meteorgolem')).toHaveLength(0);
  const attack = a.events.find((e) => e.type === 'projectile' && e.projectileId === p.id),
    hit = a.events.find((e) => e.type === 'impact' && e.projectileId === p.id);
  expect(attack).toMatchObject({ sourceKind: 'meteorgolem', sourceLevel: 1, at: p.launched });
  expect(hit).toMatchObject({ sourceKind: 'meteorgolem', sourceLevel: 1, at: p.impact });
});
it('version 107 preserves its formerly unsplit cloned building attacker', () => {
  const a = arena(1, 107);
  a.primary.hp = 0;
  const storage = makeBuilding(2, 'goldstorage', 7, 5, 15);
  a.battle.buildings.push(storage);
  a.ctx.buildingsById.set(storage.id, storage);
  a.unit.native!.cloneUntil = 5;
  a.step(0.05);
  expect(a.unit).toMatchObject({ kind: 'meteorgolem', hp: 14500 });
  expect(a.battle.nativePendingSpawns).toBeUndefined();
  expect(a.battle.projectiles![0].native?.captureSource).toBeUndefined();
});

it('the thrown half cannot kill its primary before the original projectile impact resolves', () => {
  const a = arena();
  a.battle.started = true;
  a.primary.x = 9.9;
  a.primary.hp = 100;
  a.primary.stunnedUntil = 100;
  const observed: FX[] = [];
  a.model.onEffect = (fx) => observed.push(fx);
  a.step(0.05);
  const p = a.battle.projectiles![0];
  while (a.battle.elapsed < p.impact - 1e-9) a.model.step(0.05);
  expect(a.primary.hp).toBe(0);
  expect(a.primary.defeatedAt).toBeCloseTo(p.impact, 8);
  const child = a.battle.units.find((u) => u.kind === 'meteormite' && u.id !== a.unit.id)!;
  expect(child).toBeDefined();
  expect(observed.some((fx) => fx.type === 'hit' && fx.sourceId === child.id)).toBe(false);
});

it('captured throw/impact cues survive seeking past the cast and removal of both actor bodies', () => {
  const a = arena(3);
  a.step(0.05);
  const p = a.battle.projectiles![0];
  a.impact(p.impact);
  a.battle.units = [];
  const log = new BattleSoundLog(),
    actor = { id: p.sourceId, kind: 'meteorgolem' as const, level: 3 },
    before = JSON.stringify(a.battle);
  log.attack(a.battle, actor, 'attack', p.launched);
  log.attack(a.battle, actor, 'projectileHit', p.impact);
  const cues = troopSoundCues(a.battle, log);
  for (const [event, at] of [
    ['attack', p.launched],
    ['projectileHit', p.impact],
  ] as const) {
    const key = `troop:${p.sourceId}:${event}:${at}`,
      expected = effectCue(troopSoundEffect('meteorgolem', 3, event)!, key, at);
    expect(cues.filter((c) => c.key === key)).toEqual([expected]);
  }
  expect(troopSoundEffect('meteorgolem', 3, 'projectileHit')).toBe('Meteor_Golem_Projectile_Hit');
  expect(JSON.stringify(a.battle)).toBe(before);
  a.impact(p.impact + 10.001);
  expect(a.battle.nativeMeteorFlights).toEqual([]);
});
