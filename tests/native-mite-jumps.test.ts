import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type FX } from '../src/game/model';
import { emptyArmy } from '../src/game/army';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../src/game/replay';
import { nativeUnitStats, nativeUnitRow } from '../src/game/native-units';
import { flag } from '../src/game/native-data';
import {
  spawnNativeUnit,
  stepNativeUnit,
  stepNativeBattle,
  resolveNativeImpact,
  type NativeTroopContext,
} from '../src/game/native-troops';
import { stepProjectiles } from '../src/game/projectiles';
import type { Defender } from '../src/game/defenders';
import { initializeGarrison, stepGarrisonReleases } from '../src/game/garrison-release';
import { unitTriggersTraps } from '../src/game/native-status';

type Kind = 'yetimite' | 'firemite' | 'frostmite';
function arena(kind: Kind, level = 1, version = REPLAY_VERSION, mode: 'ground' | 'air' = 'ground') {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.nextId = 1000;
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 1)];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [];
  const battle = (model.battle = replayBattle(data.initial, version)),
    events: FX[] = [];
  const ctx: NativeTroopContext = {
    battle,
    buildings: battle.buildings,
    buildingsById: new Map(battle.buildings.map((b) => [b.id, b])),
    passableWalls: new Set(),
    nextId: () => model.state.nextId++,
    troopLevel: () => 1,
    damageBuilding: (b, n) => {
      b.hp -= n;
    },
    effect: (fx) => events.push(fx),
  };
  const unit = spawnNativeUnit(ctx, kind, level, 5.6, 6.5, 0),
    stats = nativeUnitStats(kind, level);
  const defender = (id: number, x: number, y: number, mode: 'ground' | 'air') => {
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
  const primary = defender(-1, 7.5, 6.5, mode);
  const step = (at: number, factor = 1) => {
    const dt = at - battle.elapsed;
    battle.elapsed = at;
    unit.cooldown -= dt;
    unit.pathAt -= dt;
    stepNativeUnit(ctx, unit, { ...stats, damage: stats.damage * factor }, dt);
  };
  const impact = (at: number) => {
    battle.elapsed = at;
    stepProjectiles(battle, ctx.damageBuilding, ctx.effect, (p) => resolveNativeImpact(ctx, p));
  };
  return { model, battle, ctx, events, unit, stats, primary, defender, step, impact };
}

it.each(['yetimite', 'firemite'] as const)(
  '%s waits half a second and spends itself on one original projectile',
  (kind) => {
    const a = arena(kind);
    a.step(0.05);
    expect(a.primary.hp).toBe(2000);
    expect(a.unit.hp).toBeGreaterThan(0);
    expect(a.battle.projectiles ?? []).toEqual([]);
    a.step(0.54);
    expect(a.battle.projectiles ?? []).toEqual([]);
    a.step(0.55);
    const p = a.battle.projectiles![0];
    expect(p.native).toMatchObject({ kind, name: a.stats.projectile, level: 1 });
    expect(p.damage).toBe(kind === 'yetimite' ? 56 : 50);
    expect(p.impact - p.launched).toBeCloseTo(1.9 / 4, 8);
    expect(a.unit).toMatchObject({ hp: 0, spent: true, native: { attacks: 1 } });
    expect(a.primary.hp).toBe(2000);
    a.impact(p.impact);
    expect(a.primary.hp).toBe(2000 - p.damage);
    a.step(p.impact + 1.05);
    expect(a.battle.projectiles).toEqual([]);
    expect(a.primary.hp).toBe(2000 - p.damage);
  },
);

it.each([
  ['yetimite', 1, 'ground'],
  ['yetimite', 8, 'air'],
  ['firemite', 1, 'air'],
  ['firemite', 5, 'ground'],
] as const)('%s tier %s hits its %s primary once and splashes both layers', (kind, level, mode) => {
  const a = arena(kind, level, undefined, mode),
    radius = a.stats.splash;
  const ground = a.defender(-2, 7.5 + radius / 2, 6.5, 'ground'),
    air = a.defender(-3, 7.5, 6.5 + radius / 2, 'air'),
    outside = a.defender(-4, 7.5 + radius + 0.001, 6.5, 'air');
  a.step(0.05);
  a.step(0.55);
  const p = a.battle.projectiles![0];
  const future = a.defender(-5, 7.5, 6.5, 'ground');
  future.spawnedAt = p.impact + 0.01;
  a.impact(p.impact);
  expect([a.primary.hp, ground.hp, air.hp]).toEqual([
    2000 - p.damage,
    2000 - p.damage,
    2000 - p.damage,
  ]);
  expect(outside.hp).toBe(2000);
  expect(future.hp).toBe(2000);
  expect(a.primary.frost).toBeUndefined();
  expect(ground.frost).toBeUndefined();
});

it.each(['yetimite', 'firemite'] as const)(
  '%s retains its boosted committed leap after its caster disappears',
  (kind) => {
    const a = arena(kind);
    a.step(0.05);
    a.step(0.55, 2.9);
    const p = a.battle.projectiles![0];
    a.battle.units = [];
    a.impact(p.impact);
    expect(a.primary.hp).toBeCloseTo(2000 - a.stats.damage * 2.9, 8);
  },
);

it.each(['yetimite', 'firemite'] as const)(
  '%s still bursts when its primary falls before arrival',
  (kind) => {
    const a = arena(kind),
      other = a.defender(-2, 7.5, 6.5 + a.stats.splash / 2, 'air');
    a.step(0.05);
    a.step(0.55);
    const p = a.battle.projectiles![0];
    a.primary.hp = 0;
    a.impact(p.impact);
    expect(other.hp).toBe(2000 - p.damage);
  },
);

it.each(['yetimite', 'firemite'] as const)(
  '%s keeps source trap and Castle-pull immunity',
  (kind) => {
    const a = arena(kind);
    a.unit.x = 11.5;
    a.unit.y = 11.5;
    a.battle.buildings.push(makeBuilding(2, 'clancastle', 10, 10, 1));
    a.battle.garrisons = [
      initializeGarrison({
        castleId: 2,
        mode: 'guard',
        troops: [{ kind: 'archer', level: 9, count: 1 }],
      }),
    ];
    a.battle.elapsed = 0.5;
    stepGarrisonReleases(a.battle);
    expect(a.battle.garrisons[0].released).toBe(0);
    expect(unitTriggersTraps(a.unit)).toBe(false);
    expect(flag(nativeUnitRow(kind, 1), 'DoesNotOpenCC')).toBe(true);
  },
);

it.each(['yetimite', 'firemite'] as const)(
  'version 104 preserves %s repeated direct defender hits',
  (kind) => {
    const a = arena(kind, 1, 104);
    a.step(0.05);
    expect(a.primary.hp).toBe(2000 - a.stats.damage);
    expect(a.unit.hp).toBeGreaterThan(0);
    expect(a.battle.projectiles ?? []).toEqual([]);
    a.step(1.05);
    expect(a.primary.hp).toBe(2000 - a.stats.damage * 2);
    expect(a.unit.spent).toBeUndefined();
  },
);

it.each([1, 5])('Firemite %s starts its source delayed burn only after the leap lands', (level) => {
  const a = arena('firemite', level),
    other = a.defender(-2, 7.5, 7, 'air');
  a.step(0.05);
  a.step(0.55);
  const p = a.battle.projectiles![0];
  a.impact(p.impact);
  expect(other.hp).toBe(2000);
  const burn = a.battle.nativeSpells!.find((c) => c.name === 'FireSpiritBurn')!;
  expect(burn).toMatchObject({
    level,
    castAt: p.impact,
    firstHit: p.impact + 0.5,
    total: 25,
    interval: 0.4,
  });
  a.battle.elapsed = burn.firstHit - 0.001;
  stepNativeBattle(a.ctx);
  expect(other.hp).toBe(2000);
  a.battle.elapsed = burn.firstHit;
  stepNativeBattle(a.ctx);
  expect(other.hp).toBeLessThan(2000);
});

it.each([
  ['frostmite', 104, 0.12],
  ['frostmite', REPLAY_VERSION, 0.0125],
  ['yetimite', REPLAY_VERSION, 0.0125],
  ['firemite', REPLAY_VERSION, 0.0125],
] as const)('%s combat %s uses the source short-flight clock', (kind, version, duration) => {
  const a = arena(kind, 1, version);
  a.unit.x = 7.45;
  a.step(0.05);
  a.step(0.55);
  const p = a.battle.projectiles![0];
  expect(p.impact - p.launched).toBeCloseTo(duration, 8);
});

it('retains Yetimite defense damage while its building burst reaches nearby airborne defenders', () => {
  const a = arena('yetimite'),
    cannon = makeBuilding(2, 'cannon', 9, 5, 10);
  a.battle.buildings.push(cannon);
  a.ctx.buildingsById.set(cannon.id, cannon);
  const air = a.defender(-2, 10.5, 6.7, 'air');
  for (let i = 1; i <= 80 && !a.unit.spent; i++) a.step(i * 0.05);
  const p = a.battle.projectiles![0];
  expect(p.targetBuilding).toBe(true);
  expect(p.targetId).toBe(cannon.id);
  a.impact(p.impact);
  expect(cannon.hp).toBe(cannon.maxHp - 56 * 4);
  expect(air.hp).toBe(2000 - 56);
});
