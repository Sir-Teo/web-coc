import { expect, it } from 'vitest';
import { emptyArmy } from '../src/game/army';
import { GameModel, makeBuilding, type Building, type Unit } from '../src/game/model';
import { defenseState, activeAsDefense } from '../src/game/native-defenses';
import { nativeUnitStats } from '../src/game/native-units';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../src/game/replay';
import {
  resolveNativeImpact,
  spawnNativeUnit,
  stepNativeUnit,
  type NativeTroopContext,
} from '../src/game/native-troops';
import { launchProjectile, stepProjectiles } from '../src/game/projectiles';
import type { Defender } from '../src/game/defenders';

function arena(version = REPLAY_VERSION) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 20, 20, 12),
    makeBuilding(2, 'goldstorage', 6, 5, 1),
  ];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [];
  const battle = (model.battle = replayBattle(data.initial, version));
  const hits: { id: number; damage: number; at?: number }[] = [];
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
    effect: () => {},
  };
  const hall = battle.buildings[0];
  const add = (kind: Building['kind'], x: number, y: number, level = 1) => {
    const b = makeBuilding(model.state.nextId++, kind, x, y, level);
    battle.buildings.push(b);
    ctx.buildingsById.set(b.id, b);
    return b;
  };
  const spawn = (kind: Unit['kind']) => spawnNativeUnit(ctx, kind, 1, 4, 6.5, 0);
  const step = (u: Unit, at = 0.05) => {
    const dt = at - battle.elapsed;
    battle.elapsed = at;
    u.cooldown -= dt;
    u.pathAt -= dt;
    stepNativeUnit(ctx, u, nativeUnitStats(u.kind, 1), dt);
  };
  return { model, battle, ctx, hall, add, spawn, step, hits };
}

it.each(['yetimite', 'frostmite', 'supergiant', 'rocketballoon', 'lavahound'] as const)(
  '%s chooses an activated Town Hall before a nearer resource building',
  (kind) => {
    const a = arena();
    defenseState(a.battle, a.hall).awakeAt = 0;
    const u = a.spawn(kind);
    a.step(u);
    expect(u.target).toBe(a.hall.id);
  },
);
it.each([1, 12, 18])('a dormant Town Hall %s remains outside the defense preference', (level) => {
  const a = arena();
  a.hall.level = level;
  const u = a.spawn('yetimite');
  a.step(u);
  expect(u.target).toBe(2);
});
it.each([
  ['awake', 2, false, true],
  ['dormant', 2, false, false],
  ['unarmed', 1, false, true],
  ['upgrading', 2, true, true],
] as const)(
  'an %s Builder hut has source defense eligibility',
  (_name, level, upgrading, awake) => {
    const a = arena(),
      hut = a.add('builder', 12, 5, level);
    if (upgrading) hut.upgradeEnd = 100;
    if (awake) defenseState(a.battle, hut).awakeAt = 0;
    const u = a.spawn('yetimite');
    a.step(u);
    expect(u.target).toBe(level > 1 && !upgrading && awake ? hut.id : 2);
  },
);
it('an active native weapon keeps a defense-first summon from chasing an attacking defender', () => {
  const a = arena();
  defenseState(a.battle, a.hall).awakeAt = 0;
  a.battle.defenders = [
    {
      kind: 'skeleton',
      id: -1,
      x: 4.5,
      y: 6.5,
      mode: 'ground',
      hp: 100,
      maxHp: 100,
      cooldown: 0,
      target: null,
      path: [],
      pathAt: 0,
      attacking: false,
      alerted: true,
      spawnedAt: 0,
    } as Defender,
  ];
  const u = a.spawn('yetimite');
  a.step(u);
  expect(u.defenderTarget).toBeUndefined();
  expect(u.target).toBe(a.hall.id);
});
it.each([
  [106, 1, 0, 2],
  [106, 1, 0.3, 2],
  [106, 1, 1, 0.5],
  [106, 8, 0, 2],
  [105, 1, 0, 0.5],
] as const)(
  'version %s Yetimite %s checks the Town Hall class at impact (wake %s)',
  (version, level, awakeAt, multiplier) => {
    const a = arena(version);
    a.hall.x = 7;
    a.hall.y = 5;
    defenseState(a.battle, a.hall).awakeAt = awakeAt;
    const u = a.spawn('yetimite'),
      stats = nativeUnitStats('yetimite', level);
    launchProjectile(
      a.battle,
      {
        weapon: 'native',
        native: { kind: 'yetimite', level, name: stats.projectile },
        sourceId: u.id,
        targetId: a.hall.id,
        targetBuilding: true,
        fromX: 6,
        fromY: 6.5,
        x: 7.5,
        y: 6.5,
        damage: stats.damage,
        splash: stats.splash,
      },
      a.ctx.effect,
    );
    const p = a.battle.projectiles![0];
    expect(p.impact).toBeLessThan(1);
    a.battle.elapsed = 2;
    stepProjectiles(a.battle, a.ctx.damageBuilding, a.ctx.effect, (p) =>
      resolveNativeImpact(a.ctx, p),
    );
    expect(a.hits.find((h) => h.id === a.hall.id)).toEqual({
      id: a.hall.id,
      damage: stats.damage * multiplier,
      at: p.impact,
    });
  },
);
it('version 105 retains the old static defense preference', () => {
  const a = arena(105);
  defenseState(a.battle, a.hall).awakeAt = 0;
  expect(activeAsDefense(a.battle, a.hall)).toBe(true);
  const u = a.spawn('yetimite');
  a.step(u);
  expect(u.target).toBe(2);
});

it('rechecks an indexed Town Hall when it wakes while a defender is being chased', () => {
  const a = arena();
  a.ctx.isTargetable = (b) => b.hp > 0;
  a.battle.defenders = [
    {
      kind: 'skeleton',
      id: -1,
      x: 4.5,
      y: 6.5,
      mode: 'ground',
      hp: 100,
      maxHp: 100,
      cooldown: 0,
      target: null,
      path: [],
      pathAt: 0,
      attacking: false,
      alerted: true,
      spawnedAt: 0,
    } as Defender,
  ];
  const u = a.spawn('yetimite');
  a.step(u);
  expect(u.defenderTarget).toBe(-1);
  defenseState(a.battle, a.hall).awakeAt = 0.1;
  a.step(u, 0.1);
  expect(u.defenderTarget).toBeUndefined();
  expect(u.target).toBe(a.hall.id);
  expect(u.hp).toBeGreaterThan(0);
});

it.each([
  [1, false],
  [11, false],
  [12, true],
  [13, true],
  [17, true],
  [18, false],
] as const)(
  'Town Hall %s requires a source weapon before activation grants Defense',
  (level, armed) => {
    const a = arena();
    a.hall.level = level;
    defenseState(a.battle, a.hall).awakeAt = 0;
    const u = a.spawn('yetimite');
    a.step(u);
    expect(u.target).toBe(armed ? a.hall.id : 2);
  },
);
