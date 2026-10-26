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
import type { Defender } from '../src/game/defenders';

function arena(level = 1, version = REPLAY_VERSION) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 1),
    makeBuilding(2, 'goldstorage', 7, 5, 15),
    makeBuilding(3, 'elixirstorage', 11, 5, 15),
    makeBuilding(4, 'goldstorage', 15, 5, 15),
    makeBuilding(5, 'elixirstorage', 19, 5, 15),
    makeBuilding(6, 'goldstorage', 23, 5, 15),
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
  const unit = spawnNativeUnit(ctx, 'superarcher', level, 5, 6.5, 0),
    stats = nativeUnitStats('superarcher', level);
  const step = (at: number, factor = 1, actionRatio = 1) => {
    const dt = at - battle.elapsed;
    battle.elapsed = at;
    unit.cooldown -= dt;
    unit.pathAt -= dt;
    stepNativeUnit(ctx, unit, { ...stats, damage: stats.damage * factor }, dt, dt * actionRatio);
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
      hp: 5000,
      maxHp: 5000,
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
it.each([1, 10])(
  'Super Archer %s hits structures progressively and continues past the primary',
  (level) => {
    const a = arena(level);
    a.step(0.05);
    expect(a.battle.projectiles ?? []).toEqual([]);
    const shot = a.battle.nativeArcherShots![0];
    expect(shot).toMatchObject({
      projectile: 'magic_archer_projectile',
      speed: 14,
      radius: 0.3,
      length: 7.5,
    });
    expect(a.hits).toEqual([]);
    a.pending(0.17);
    expect(a.hits).toEqual([]);
    a.pending(0.18);
    expect(a.hits).toHaveLength(1);
    expect(a.hits[0].at).toBeCloseTo(0.05 + 1.7 / 14, 8);
    a.pending(0.4);
    expect(a.hits).toHaveLength(1);
    a.pending(0.46);
    expect(a.hits.map((h) => h.id)).toEqual([2, 3]);
    expect(a.hits[1].at).toBeCloseTo(0.05 + 5.7 / 14, 8);
    a.pending(1);
    expect(a.hits).toHaveLength(2);
    expect(a.hits.every((h) => h.damage === a.stats.damage)).toBe(true);
  },
);
it('one native arrow crosses ground/air defenders and buildings, each at most once', () => {
  const a = arena(),
    ground = a.defender(-1, 7.4, 6.5),
    air = a.defender(-2, 10, 6.5, 'air');
  a.step(0.05);
  expect(a.battle.projectiles ?? []).toEqual([]);
  a.pending(1);
  a.pending(1.1);
  expect(ground.hp).toBe(5000 - a.stats.damage);
  expect(air.hp).toBe(5000 - a.stats.damage);
  const hits = a.battle.nativeArcherShots![0].hit;
  expect(hits.filter((h) => !h.target.building)).toHaveLength(2);
  expect(hits.find((h) => h.target.id === -1)!.at).toBeCloseTo(0.2, 8);
  expect(a.hits.map((h) => h.id)).toEqual([2, 3]);
});
it('fixed arrows miss a primary that moves aside and preserve the original direction', () => {
  const a = arena(),
    primary = a.defender(-1, 7.4, 6.5);
  a.step(0.05);
  primary.y = 8;
  a.pending(1);
  expect(primary.hp).toBe(5000);
  expect(a.battle.nativeArcherShots![0]).toMatchObject({ dirX: 1, dirY: 0 });
  expect(a.hits.map((h) => h.id)).toEqual([2, 3]);
});
it('captured outgoing damage and tier survive the caster disappearing', () => {
  const a = arena(10);
  a.step(0.05, 2.9);
  a.battle.units = [];
  a.pending(1);
  expect(a.hits).toHaveLength(2);
  expect(a.hits.every((h) => Math.abs(h.damage - a.stats.damage * 2.9) < 1e-9)).toBe(true);
});
it('invisible collateral remains hittable while buried Teslas, traps and unborn defenders do not', () => {
  const a = arena(),
    hidden = a.defender(-1, 10, 6.5),
    future = a.defender(-2, 9.5, 6.5);
  hidden.alerted = future.alerted = false;
  hidden.invisibleUntil = 10;
  future.spawnedAt = 2;
  a.battle.buildings.push(makeBuilding(90, 'tesla', 9, 6, 1), makeBuilding(91, 'bomb', 10, 6, 1));
  a.step(0.05);
  a.pending(1);
  expect(hidden.hp).toBe(5000 - a.stats.damage);
  expect(future.hp).toBe(5000);
  expect(a.hits.map((h) => h.id)).toEqual([2, 3]);
});
it('radius rejects defenders outside the line and arrows never damage allies', () => {
  const a = arena(),
    inside = a.defender(-1, 10, 6.79),
    outside = a.defender(-2, 10, 6.81);
  inside.alerted = outside.alerted = false;
  const ally = spawnNativeUnit(a.ctx, 'swordsman', 1, 10, 6.5, 0),
    hp = ally.hp;
  a.step(0.05);
  a.pending(1);
  expect(inside.hp).toBe(5000 - a.stats.damage);
  expect(outside.hp).toBe(5000);
  expect(ally.hp).toBe(hp);
});
it('version 110 keeps instant secondary building damage at primary impact and generic defender arrows', () => {
  const a = arena(1, 110);
  a.step(0.05);
  expect(a.battle.nativeArcherShots).toBeUndefined();
  const p = a.battle.projectiles![0];
  a.battle.elapsed = p.impact;
  resolveNativeImpact(a.ctx, p);
  expect(a.hits.map((h) => h.id)).toEqual([2, 3]);
  expect(a.hits.every((h) => h.at === p.impact)).toBe(true);
  const b = arena(1, 110);
  b.defender(-1, 7.4, 6.5);
  b.step(0.05);
  expect(b.battle.projectiles![0]).toMatchObject({ weapon: 'arrow' });
});
it('late updates resolve crossing events across different arrows in arrival order', () => {
  const a = arena();
  a.step(0.05);
  a.unit.x = 6.5;
  a.unit.cooldown = 0;
  a.step(0.1);
  a.pending(1);
  const hits = a.hits.filter((h) => h.id === 2);
  expect(hits).toHaveLength(2);
  expect(hits[0].at).toBeCloseTo(0.1 + 0.2 / 14, 8);
  expect(hits[1].at).toBeCloseTo(0.05 + 1.7 / 14, 8);
});
it('point-blank primaries are struck once without a zero-length direction', () => {
  const a = arena();
  const primary = a.defender(-1, 5, 6.5);
  a.step(0.05);
  a.pending(0.1);
  expect(primary.hp).toBe(5000 - a.stats.damage);
  expect(a.battle.nativeArcherShots![0]).toMatchObject({ dirX: 1, dirY: 0, length: 4 });
});
it('arrows also pierce correctly along a negative axis', () => {
  const a = arena();
  a.unit.x = 14;
  a.step(0.05);
  a.pending(1);
  expect(a.battle.nativeArcherShots![0]).toMatchObject({ dirX: -1, dirY: 0 });
  expect(a.hits.map((h) => h.id)).toEqual([3, 2]);
});
it('a final clone’s arrow finishes its full flight before the raid ends', () => {
  const a = arena();
  a.battle.started = true;
  a.battle.remaining = emptyArmy();
  a.unit.native!.cloneUntil = 0.1;
  a.unit.summoned = true;
  a.step(0.05);
  a.model.step(0.05);
  expect(a.battle.finished).toBe(false);
  while (!a.battle.finished && a.battle.elapsed < 1) a.model.step(0.05);
  expect(a.battle.finished).toBe(true);
  const shot = a.battle.nativeArcherShots![0];
  expect(shot.travelled).toBe(shot.length);
  expect(shot.hit.map((h) => h.target.id)).toEqual([2, 3]);
});
it('Overgrowth absorbs a crossing without damage and the arrow continues beyond it', () => {
  const a = arena(),
    primary = a.battle.buildings[1],
    hp = primary.hp;
  a.ctx.damageBuilding = (b, p, at) => a.model.damage(b, p, at);
  a.step(0.05);
  a.battle.buildingEffects ??= {};
  a.battle.buildingEffects[primary.id] = { overgrownUntil: 5 };
  a.pending(1);
  expect(primary.hp).toBe(hp);
  expect(a.battle.buildings[2].hp).toBe(a.battle.buildings[2].maxHp - a.stats.damage);
  expect(a.battle.nativeArcherShots![0].hit.map((h) => h.target.id)).toEqual([2, 3]);
});
