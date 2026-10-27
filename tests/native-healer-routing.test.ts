import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Unit } from '../src/game/model';
import { emptyArmy } from '../src/game/army';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../src/game/replay';
import {
  initialNativeState,
  stepNativeUnit,
  type NativeTroopContext,
} from '../src/game/native-troops';
import { nativeUnitStats } from '../src/game/native-units';
import { subtileSolid } from '../src/game/subtile-path';

function arena(kind: 'unicorn' | 'druid', version = REPLAY_VERSION) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'goldstorage', 5, 3, 1),
  ];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [];
  const battle = (model.battle = replayBattle(data.initial, version));
  let id = 1000;
  const unit = (kind: Unit['kind'], x: number, y: number): Unit => {
    const stats = nativeUnitStats(kind, 1);
    const result: Unit = {
      id: id++,
      kind,
      x,
      y,
      hp: stats.hp - 1,
      maxHp: stats.hp,
      level: 1,
      cooldown: 0,
      target: null,
      path: [],
      pathAt: 0,
      attacking: false,
      native: initialNativeState(kind, 1),
    };
    battle.units.push(result);
    return result;
  };
  const caster = unit(kind, 2, 5),
    target = unit('giant', 13, 5),
    stats = nativeUnitStats(kind, 1);
  caster.healTarget = target.id;
  const ctx: NativeTroopContext = {
    battle,
    buildings: battle.buildings,
    buildingsById: new Map(battle.buildings.map((b) => [b.id, b])),
    passableWalls: new Set(),
    nextId: () => id++,
    troopLevel: () => 1,
    damageBuilding: () => {
      throw Error('A healer attacked a building');
    },
    effect: () => {},
  };
  const positions: { x: number; y: number }[] = [];
  const step = () => {
    battle.elapsed += 0.05;
    caster.pathAt -= 0.05;
    caster.cooldown -= 0.05;
    // Context route caches belong to one simulation tick.
    ctx.routeCache = undefined;
    stepNativeUnit(ctx, caster, stats, 0.05);
    positions.push({ x: caster.x, y: caster.y });
  };
  const follow = () => {
    for (let i = 0; i < 250 && !caster.attacking; i++) step();
    expect(caster.attacking).toBe(true);
    expect(Math.hypot(caster.x - target.x, caster.y - target.y)).toBeLessThanOrEqual(
      stats.range + 1e-6,
    );
  };
  return { battle, caster, target, stats, ctx, unit, step, follow, positions };
}

it.each(['unicorn', 'druid'] as const)(
  '%s follows around solid buildings to its source healing range',
  (kind) => {
    const a = arena(kind),
      solid = subtileSolid(a.battle.buildings);
    expect(a.stats.flying).toBe(false);
    expect(a.stats.jumper).toBe(true);
    a.follow();
    expect(a.positions.every((p) => !solid(p.x, p.y))).toBe(true);
    expect(a.positions.some((p) => Math.abs(p.y - 5) > 0.4)).toBe(true);
    expect(a.caster.path).toEqual([]);
  },
);

it.each(['unicorn', 'druid'] as const)(
  '%s crosses walls without walking through buildings or attacking the walls',
  (kind) => {
    const a = arena(kind);
    for (let y = 0; y < 16; y++) a.battle.buildings.push(makeBuilding(100 + y, 'wall', 4, y, 1));
    const buildingsOnly = subtileSolid(a.battle.buildings.filter((b) => b.kind !== 'wall'));
    a.follow();
    expect(a.positions.some((p) => Math.floor(p.x) === 4)).toBe(true);
    expect(a.positions.every((p) => !buildingsOnly(p.x, p.y))).toBe(true);
    expect(a.battle.buildings.filter((b) => b.kind === 'wall').every((b) => b.hp === b.maxHp)).toBe(
      true,
    );
  },
);

it('defers a ground healer when the shared path budget is exhausted, then resumes', () => {
  const a = arena('druid');
  a.ctx.pathBudget = { count: 1, limit: 1 };
  a.step();
  expect([a.caster.x, a.caster.y]).toEqual([2, 5]);
  expect(a.caster.pathAt).toBeLessThanOrEqual(0.15);
  a.ctx.pathBudget.count = 0;
  a.step();
  expect(a.ctx.pathBudget.count).toBe(1);
  expect(a.caster.x).toBeGreaterThan(2);
});

it.each(['dead', 'removed', 'recalled'] as const)(
  'drops a stale route immediately when the recipient is %s',
  (state) => {
    const a = arena('druid');
    a.step();
    expect(a.caster.path.length).toBeGreaterThan(0);
    if (state === 'dead') a.target.hp = 0;
    if (state === 'removed') a.battle.units = a.battle.units.filter((u) => u.id !== a.target.id);
    if (state === 'recalled') a.target.native!.recalled = true;
    const point = [a.caster.x, a.caster.y];
    a.step();
    expect(a.caster.healTarget).toBeUndefined();
    expect(a.caster.path).toEqual([]);
    expect([a.caster.x, a.caster.y]).toEqual(point);
  },
);

it('changes direction immediately for a new recipient instead of keeping the previous route', () => {
  const a = arena('druid');
  a.step();
  const previousPath = JSON.stringify(a.caster.path);
  a.target.hp = 0;
  const other = a.unit('giant', 0, 14);
  a.step();
  expect(a.caster.healTarget).toBe(other.id);
  expect(JSON.stringify(a.caster.path)).not.toBe(previousPath);
  const end = a.caster.path.at(-1)!;
  expect(Math.hypot(end.x - other.x, end.y - other.y)).toBeLessThanOrEqual(a.stats.range + 1e-6);
});

it('refreshes its route as the same recipient moves', () => {
  const a = arena('unicorn');
  a.step();
  a.target.y = 13;
  a.follow();
  expect(a.caster.y).toBeGreaterThan(10);
});

it.each(['unicorn', 'druid'] as const)(
  'version 100 preserves the former straight-line %s movement',
  (kind) => {
    const a = arena(kind, 100),
      solid = subtileSolid(a.battle.buildings);
    a.follow();
    expect(a.positions.some((p) => solid(p.x, p.y))).toBe(true);
    expect(a.positions.every((p) => p.y === 5)).toBe(true);
  },
);

it.each(['unicorn', 'druid'] as const)(
  '%s also avoids the native campaign half-tile collision core',
  (kind) => {
    const a = arena(kind);
    a.battle.nativeSubtiles = true;
    for (let y = 0; y < 16; y++) a.battle.buildings.push(makeBuilding(100 + y, 'wall', 4, y, 1));
    const solid = subtileSolid(a.battle.buildings.filter((b) => b.kind !== 'wall'));
    a.follow();
    expect(a.positions.every((p) => !solid(p.x, p.y))).toBe(true);
    expect(a.positions.some((p) => Math.floor(p.x) === 4)).toBe(true);
  },
);
