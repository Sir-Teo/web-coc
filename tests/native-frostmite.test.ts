import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type FX, type Unit } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../src/game/replay';
import { nativeUnitStats, nativeUnitRow } from '../src/game/native-units';
import { flag } from '../src/game/native-data';
import {
  spawnNativeUnit,
  stepNativeUnit,
  resolveNativeImpact,
  type NativeTroopContext,
} from '../src/game/native-troops';
import { stepProjectiles } from '../src/game/projectiles';
import { type Defender } from '../src/game/defenders';
import { defenderFrostScales } from '../src/game/defender-frost';
import { buildingAttackIntervalScale, unitTriggersTraps } from '../src/game/native-status';
import { initializeGarrison, stepGarrisonReleases } from '../src/game/garrison-release';

function arena(level = 1, version = REPLAY_VERSION) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.nextId = 1000;
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 1)];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = emptySpells();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [{ kind: 'king', level: 1, items: [], pet: { kind: 'frosty', level } }];
  const battle = (model.battle = replayBattle(data.initial, version));
  if (!model.deployNativeHero('king', 3, 6.5)) throw Error('Frosty deployment failed');
  const pet = battle.units.find((u) => u.id === battle.nativeHeroes![0].petId)!;
  const events: FX[] = [];
  const ctx: NativeTroopContext = {
    battle,
    buildings: battle.buildings,
    buildingsById: new Map(battle.buildings.map((b) => [b.id, b])),
    passableWalls: new Set(),
    nextId: () => model.state.nextId++,
    troopLevel: () => 1,
    damageBuilding: (b, damage) => {
      b.hp -= damage;
    },
    effect: (fx) => events.push(fx),
  };
  const building = (kind: Parameters<typeof makeBuilding>[1], x: number, y: number) => {
    const b = makeBuilding(model.state.nextId++, kind, x, y, 1);
    battle.buildings.push(b);
    ctx.buildingsById.set(b.id, b);
    return b;
  };
  const child = (x = 5.6, y = 6.5) => spawnNativeUnit(ctx, 'frostmite', 1, x, y, 0, pet.id);
  const defender = (id: number, x: number, y: number, mode: 'ground' | 'air' = 'ground') => {
    const d = {
      kind: 'skeleton',
      id,
      x,
      y,
      mode,
      hp: 100,
      maxHp: 100,
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
  const step = (u: Unit, at: number, factor = 1) => {
    const dt = at - battle.elapsed;
    battle.elapsed = at;
    u.cooldown -= dt;
    u.pathAt -= dt;
    const s = nativeUnitStats(u.kind, u.level ?? 1);
    stepNativeUnit(ctx, u, { ...s, damage: s.damage * factor }, dt);
  };
  const impact = (at: number) => {
    battle.elapsed = at;
    stepProjectiles(battle, ctx.damageBuilding, ctx.effect, (p) => resolveNativeImpact(ctx, p));
  };
  return { model, battle, pet, ctx, events, building, child, defender, step, impact };
}

it.each([
  [1, 1, 4],
  [5, 2, 8],
  [10, 2, 10],
  [15, 3, 12],
])('Frosty %s summons %s Frostmites per eight-second wave up to %s alive', (level, wave, limit) => {
  const a = arena(level);
  a.step(a.pet, 0.05);
  const first = a.battle.units.filter((u) => u.kind === 'frostmite');
  expect(first).toHaveLength(wave);
  expect(first.every((u) => u.level === 1 && u.hp === 450 && u.native?.owner === a.pet.id)).toBe(
    true,
  );
  for (let i = 1; i <= 6; i++) a.step(a.pet, i * 8);
  const children = a.battle.units.filter((u) => u.kind === 'frostmite');
  expect(children).toHaveLength(limit);
  expect(a.pet.hp).toBeGreaterThan(0);
});

it('replenishes an available slot on the next periodic Frosty wave', () => {
  const a = arena();
  a.step(a.pet, 0.05);
  for (let i = 1; i <= 3; i++) a.step(a.pet, i * 8);
  a.battle.units.find((u) => u.kind === 'frostmite')!.hp = 0;
  a.step(a.pet, 31.95);
  expect(a.battle.units.filter((u) => u.kind === 'frostmite' && u.hp > 0)).toHaveLength(3);
  a.step(a.pet, 32);
  expect(a.battle.units.filter((u) => u.kind === 'frostmite' && u.hp > 0)).toHaveLength(4);
});

it('waits the source half-second target delay, then hands its single body to the native jump', () => {
  const a = arena(),
    target = a.building('cannon', 7, 5),
    u = a.child();
  a.step(u, 0.05);
  a.step(u, 0.54);
  expect(a.battle.projectiles ?? []).toEqual([]);
  a.step(u, 0.55);
  const p = a.battle.projectiles![0];
  expect(p.native).toMatchObject({ name: 'FrostmiteJump', kind: 'frostmite', level: 1 });
  expect(p.damage).toBe(15);
  expect(p.splash).toBe(0.8);
  expect(p.impact - p.launched).toBeCloseTo(Math.hypot(p.x - p.fromX, p.y - p.fromY) / 4, 8);
  expect(u).toMatchObject({ hp: 0, spent: true, native: { attacks: 1 } });
  expect(target.hp).toBe(target.maxHp);
  a.impact(p.impact);
  expect(target.hp).toBe(target.maxHp - 15);
  expect(a.battle.buildingEffects![target.id].frost).toEqual({ until: p.impact + 4, percent: 0.5 });
  expect(buildingAttackIntervalScale(a.battle, target, p.impact)).toBe(2);
  expect(buildingAttackIntervalScale(a.battle, target, p.impact + 4)).toBe(1);
  a.step(u, p.impact + 0.05);
  expect(a.battle.projectiles).toEqual([]);
});

it.each(['ground', 'air'] as const)(
  'jumps once at a %s defender and applies damage/slow across both layers',
  (mode) => {
    const a = arena(),
      u = a.child(),
      primary = a.defender(-1, 7.5, 6.5, mode),
      ground = a.defender(-2, 7.5, 6.9),
      air = a.defender(-3, 7.5, 6.1, 'air'),
      outside = a.defender(-4, 8.301, 6.5);
    const storage = a.building('goldstorage', 8, 5),
      wall = a.building('wall', 7, 5);
    a.step(u, 0.05);
    a.step(u, 0.54);
    expect(a.battle.projectiles ?? []).toEqual([]);
    a.step(u, 0.55);
    const p = a.battle.projectiles![0];
    expect(p).toMatchObject({
      weapon: 'native',
      targetDefender: true,
      targetId: primary.id,
      toAir: mode === 'air',
    });
    expect(u.hp).toBe(0);
    expect(u.spent).toBe(true);
    const future = a.defender(-5, 7.5, 6.7);
    future.spawnedAt = p.impact + 0.01;
    a.impact(p.impact);
    for (const d of [primary, ground, air]) {
      expect(d.hp).toBe(85);
      expect(d.frost).toEqual({ until: p.impact + 4, percent: 0.5 });
      expect(defenderFrostScales(d, p.impact + 3.99)).toEqual({ move: 0.5, attack: 0.5 });
      expect(defenderFrostScales(d, p.impact + 4)).toEqual({ move: 1, attack: 1 });
    }
    expect(storage.hp).toBe(storage.maxHp - 7.5);
    expect(wall.hp).toBe(wall.maxHp - 15);
    expect(a.battle.buildingEffects![storage.id].frost).toEqual({
      until: p.impact + 4,
      percent: 0.5,
    });
    expect(a.battle.buildingEffects![wall.id].frost).toEqual({ until: p.impact + 4, percent: 0.5 });
    expect(outside.hp).toBe(100);
    expect(outside.frost).toBeUndefined();
    expect(future.hp).toBe(100);
    expect(future.frost).toBeUndefined();
  },
);

it('lands the committed blast after its primary defender has fallen', () => {
  const a = arena(),
    u = a.child(),
    primary = a.defender(-1, 7.5, 6.5),
    other = a.defender(-2, 7.5, 6.9, 'air');
  a.step(u, 0.05);
  a.step(u, 0.55);
  const p = a.battle.projectiles![0];
  primary.hp = 0;
  a.impact(p.impact);
  expect(other.hp).toBe(85);
  expect(other.frost?.percent).toBe(0.5);
});

it('retains its outgoing boosted damage after its spent caster and boost are gone', () => {
  const a = arena(),
    target = a.building('cannon', 7, 5),
    u = a.child();
  a.step(u, 0.05);
  a.step(u, 0.55, 2.9);
  const p = a.battle.projectiles![0];
  a.battle.units = a.battle.units.filter((v) => v.id !== u.id);
  a.impact(p.impact);
  expect(target.hp).toBeCloseTo(target.maxHp - 15 * 2.9, 8);
  expect(a.battle.buildingEffects![target.id].frost?.percent).toBe(0.5);
});

it('ignores traps and cannot pull a Castle reserve', () => {
  const a = arena(),
    u = a.child(11.5, 11.5);
  a.battle.units = [u];
  a.building('clancastle', 10, 10);
  const castle = a.battle.buildings.at(-1)!;
  a.battle.garrisons = [
    initializeGarrison({
      castleId: castle.id,
      mode: 'guard',
      troops: [{ kind: 'archer', level: 9, count: 1 }],
    }),
  ];
  a.battle.elapsed = 0.5;
  stepGarrisonReleases(a.battle);
  expect(a.battle.garrisons[0].released).toBe(0);
  expect(unitTriggersTraps(u)).toBe(false);
  expect(flag(nativeUnitRow('frostmite', 1), 'DoesNotOpenCC')).toBe(true);
});

it('preserves the missing Frostmite lookup through combat version 103', () => {
  const a = arena(15, 103);
  a.step(a.pet, 0.05);
  a.step(a.pet, 8);
  expect(a.battle.units.some((u) => u.kind === 'frostmite')).toBe(false);
  expect(a.battle.nativeHeroes![0].petSummonerId).toBeUndefined();
});

it('routes across standing Walls without attacking them', () => {
  const a = arena(),
    target = a.building('cannon', 11, 5),
    u = a.child();
  const walls = Array.from({ length: 16 }, (_, y) => a.building('wall', 7, y));
  let crossed = false;
  for (let i = 1; i <= 80 && u.hp > 0; i++) {
    a.step(u, i * 0.05);
    if (u.x >= 7 && u.x < 8) crossed = true;
  }
  expect(crossed).toBe(true);
  expect(u.spent).toBe(true);
  expect(walls.every((wall) => wall.hp === wall.maxHp)).toBe(true);
  expect(a.battle.projectiles).toContainEqual(
    expect.objectContaining({ sourceId: u.id, targetId: target.id }),
  );
});
