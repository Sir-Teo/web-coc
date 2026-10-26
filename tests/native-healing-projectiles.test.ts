import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Unit, type FX } from '../src/game/model';
import { emptyArmy } from '../src/game/army';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../src/game/replay';
import {
  initialNativeState,
  stepNativeUnit,
  resolveNativeImpact,
  type NativeTroopContext,
} from '../src/game/native-troops';
import { nativeUnitStats } from '../src/game/native-units';
import { stepProjectiles, projectileEffect } from '../src/game/projectiles';

function arena(kind: 'unicorn' | 'druid' = 'druid', level = 1, version = REPLAY_VERSION) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.nextId = 1000;
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [];
  const battle = (model.battle = replayBattle(data.initial, version));
  battle.started = true;
  let id = 1000;
  const unit = (kind: Unit['kind'], x: number, ownLevel = 1) => {
    const s = nativeUnitStats(kind, ownLevel);
    const u: Unit = {
      id: id++,
      kind,
      level: ownLevel,
      x,
      y: 5,
      hp: 100,
      maxHp: s.hp,
      cooldown: 0,
      target: null,
      path: [],
      pathAt: 0,
      attacking: false,
      native: initialNativeState(kind, ownLevel),
    };
    battle.units.push(u);
    return u;
  };
  const caster = unit(kind, 5, level),
    target = unit('giant', 7.4);
  caster.healTarget = target.id;
  const events: FX[] = [],
    damage: number[] = [];
  const ctx: NativeTroopContext = {
    battle,
    buildings: battle.buildings,
    buildingsById: new Map(battle.buildings.map((b) => [b.id, b])),
    passableWalls: new Set(),
    nextId: () => id++,
    troopLevel: () => 1,
    damageBuilding: (_b, amount) => damage.push(amount),
    effect: (fx) => events.push(fx),
  };
  const cast = (factor = 1) => {
    const s = nativeUnitStats(kind, level);
    stepNativeUnit(ctx, caster, { ...s, heal: s.heal * factor }, 0.05);
    return battle.projectiles?.find((p) => p.native?.healing)!;
  };
  const at = (time: number) => {
    battle.elapsed = time;
    stepProjectiles(battle, ctx.damageBuilding, ctx.effect, (p) => resolveNativeImpact(ctx, p));
  };
  const settle = () => {
    for (let count = 0; battle.projectiles?.some((p) => p.native?.healing); count++) {
      if (count > 8) throw Error('Healing chain did not end');
      at(Math.min(...battle.projectiles!.map((p) => p.impact)));
    }
  };
  return { model, battle, caster, target, unit, cast, at, settle, events, damage };
}

it.each(['unicorn', 'druid'] as const)(
  '%s heals on source 12-tile/s arrival rather than at launch',
  (kind) => {
    const { target, cast, at, damage } = arena(kind);
    const shot = cast();
    expect(target.hp).toBe(100);
    expect(shot.native!.name).toBe(
      kind === 'unicorn' ? 'UnicornHealEnergy' : 'BattleDruidProjectile',
    );
    expect(shot.impact - shot.launched).toBeCloseTo(0.2, 10);
    at(shot.impact - 0.001);
    expect(target.hp).toBe(100);
    at(shot.impact);
    expect(target.hp).toBe(100 + nativeUnitStats(kind, 1).heal);
    expect(damage).toEqual([]);
  },
);

it('does not stretch a short healing flight to the ordinary 120-ms attack minimum', () => {
  const { target, cast } = arena('unicorn');
  target.x = 5.6;
  const shot = cast();
  expect(shot.impact - shot.launched).toBeCloseTo(0.05, 10);
});

it('tracks its original living recipient without changing its captured flight deadline', () => {
  const { target, cast, at } = arena('unicorn');
  const shot = cast(),
    impact = shot.impact;
  target.x += 1;
  at(0.1);
  expect(shot.x).toBe(target.x);
  expect(shot.impact).toBe(impact);
  at(impact);
  expect(target.hp).toBe(150);
});

it.each(['dead', 'recalled', 'ejected', 'immune', 'waiting', 'removed'] as const)(
  'does not heal a %s recipient or redirect its pulse',
  (state) => {
    const { battle, target, unit, cast, at } = arena('unicorn');
    const other = unit('giant', 7.5),
      shot = cast();
    if (state === 'dead') target.hp = 0;
    if (state === 'recalled') target.native!.recalled = true;
    if (state === 'ejected') target.ejected = true;
    if (state === 'immune') target.native!.noHealing = true;
    if (state === 'waiting') target.native!.untargetable = true;
    if (state === 'removed') battle.units = battle.units.filter((u) => u.id !== target.id);
    at(shot.impact);
    expect(target.hp).toBe(state === 'dead' ? 0 : 100);
    expect(other.hp).toBe(100);
  },
);

it.each(['dead', 'removed', 'evolved'] as const)(
  'retains outgoing healing and Hero tier after the caster is %s',
  (state) => {
    const { battle, caster, target, cast, at, events } = arena('druid', 6);
    target.hero = 'king';
    target.maxHp = 1700;
    const shot = cast(2.9);
    if (state === 'dead') caster.hp = 0;
    if (state === 'removed') battle.units = battle.units.filter((u) => u.id !== caster.id);
    if (state === 'evolved') {
      caster.kind = 'bear';
      caster.native = initialNativeState('bear', 6);
    }
    battle.troopLevels!.druid = 1;
    at(shot.impact);
    expect(target.hp - 100).toBeCloseTo(115 * 2.9 * 1.15, 8);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'impact',
        targetFriendly: true,
        sourceKind: 'druid',
        sourceLevel: 6,
      }),
    );
  },
);

it('heals at most four different recipients and preserves the bounce flight clock', () => {
  const { battle, caster, target, unit, cast, at, settle } = arena();
  const a = unit('giant', 8.4),
    b = unit('dragon', 9.4),
    c = unit('giant', 10.4),
    last = unit('giant', 11.4);
  const shot = cast();
  at(shot.impact);
  expect(target.hp).toBe(180);
  expect(a.hp).toBe(100);
  const hop = battle.projectiles![0];
  expect(hop.targetId).toBe(a.id);
  expect(hop.native!.bounce).toBe(1);
  expect(hop.launched).toBe(shot.impact);
  expect(hop.impact - hop.launched).toBeCloseTo(1 / 12, 10);
  settle();
  expect([target.hp, a.hp, b.hp, c.hp]).toEqual([180, 180, 180, 180]);
  expect(last.hp).toBe(100);
  expect(caster.hp).toBe(100);
});

it('finds the next wounded recipient at impact, not when the first shot launches', () => {
  const { battle, target, unit, cast, at } = arena();
  const a = unit('giant', 8),
    b = unit('giant', 9);
  const shot = cast();
  a.hp = a.maxHp;
  at(shot.impact);
  expect(battle.projectiles![0].targetId).toBe(b.id);
  expect(target.hp).toBe(180);
});

it.each([4.5, 4.501])('uses the exact source bounce reach at %s tiles', (reach) => {
  const { battle, target, unit, cast, at } = arena();
  const other = unit('giant', target.x + reach),
    shot = cast();
  at(shot.impact);
  expect(battle.projectiles?.[0]?.targetId).toBe(reach <= 4.5 ? other.id : undefined);
});

it('keeps identity and hop metadata in friendly sound events', () => {
  const { unit, cast, at, battle } = arena();
  unit('giant', 8);
  const shot = cast();
  expect(projectileEffect(shot, 'projectile')).toMatchObject({
    targetFriendly: true,
    projectileBounce: 0,
    sourceKind: 'druid',
    sourceLevel: 1,
  });
  at(shot.impact);
  expect(projectileEffect(battle.projectiles![0], 'projectile')).toMatchObject({
    targetFriendly: true,
    projectileBounce: 1,
    sourceKind: 'druid',
  });
});

it('preserves immediate native healing through combat version 99', () => {
  const { target, cast } = arena('druid', 1, 99);
  expect(cast()).toBeUndefined();
  expect(target.hp).toBe(180);
});
