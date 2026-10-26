import { BattleSoundLog, troopSoundCues } from '../src/game/troop-sounds';
import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type FX } from '../src/game/model';
import { emptyArmy } from '../src/game/army';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../src/game/replay';
import { nativeUnitStats } from '../src/game/native-units';
import {
  spawnNativeUnit,
  stepNativeUnit,
  stepNativeBattle,
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
  const unit = spawnNativeUnit(ctx, 'electrodragon', level, 5, 6.5, 0),
    stats = nativeUnitStats('electrodragon', level);
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
it.each([1, 9])(
  'Electro Dragon %s charges before its primary and chains five structures',
  (level) => {
    const a = arena(level);
    a.step(0.05);
    expect(a.hits).toEqual([]);
    a.step(2.9);
    expect(a.hits).toEqual([]);
    a.step(2.95);
    expect(a.hits).toEqual([{ id: 2, damage: a.stats.damage, at: 2.95 }]);
    expect(a.unit.hp).toBe(a.stats.hp);
    a.pending(3.462);
    expect(a.hits.map((h) => h.id)).toEqual([2, 3, 4, 5, 6]);
    for (let i = 0; i < 5; i++) {
      expect(a.hits[i].damage).toBeCloseTo(a.stats.damage * 0.8 ** i, 8);
      expect(a.hits[i].at).toBeCloseTo(2.95 + 0.128 * i, 8);
    }
  },
);
it('chains from a defending air unit through a structure to a ground defender', () => {
  const a = arena(),
    primary = a.defender(-1, 7.4, 6.5, 'air'),
    other = a.defender(-2, 10, 8);
  a.step(0.05);
  a.step(2.95);
  expect(primary.hp).toBe(4090);
  expect(a.battle.projectiles ?? []).toEqual([]);
  a.pending(3.078);
  expect(a.hits[0]).toMatchObject({ id: 2 });
  a.pending(3.206);
  expect(other.hp).toBeCloseTo(5000 - 910 * 0.8 * 0.8, 8);
});
it('equal-distance chain targets prefer maximum HP rather than current HP or id', () => {
  const a = arena();
  a.battle.buildings[2].hp = 0;
  a.battle.buildings[3].hp = 0;
  a.battle.buildings[4].hp = 0;
  a.battle.buildings[5].hp = 0;
  const low = a.defender(-2, 10.5, 6.5),
    high = a.defender(-3, 8.5, 8.5);
  low.maxHp = 1000;
  low.hp = 1000;
  low.alerted = false;
  high.alerted = false;
  high.maxHp = 6000;
  high.hp = 100;
  a.step(0.05);
  a.step(2.95);
  a.pending(3.078);
  expect(high.hp).toBe(0);
  expect(low.hp).toBe(1000);
});
it('committed lightning retains outgoing damage and tier after the caster disappears', () => {
  const a = arena(9);
  a.step(0.05);
  a.step(2.95, 2.9);
  a.battle.units = [];
  a.pending(3.078);
  expect(a.hits[1].damage).toBeCloseTo(1785 * 2.9 * 0.8, 8);
});
it('version 108 preserves the immediate building primary and former direct defender shot', () => {
  const a = arena(1, 108);
  a.step(0.05);
  expect(a.hits[0]).toEqual({ id: 2, damage: 910, at: 0.05 });
  const b = arena(1, 108);
  b.defender(-1, 7.4, 6.5, 'air');
  b.step(0.05);
  expect(b.battle.projectiles![0]).toMatchObject({ weapon: 'bomb' });
});

it('the 625ms recovery and 2875ms charge retain a 3.5s repeated period', () => {
  const a = arena();
  for (let tick = 1; tick <= 130; tick++) a.step(tick / 20);
  expect(a.hits.map((h) => h.at)).toEqual([2.95, 6.45]);
  expect(a.unit.native?.attacks).toBe(2);
});
it('native Freeze holds the attack and audio clocks, then resumes the charge', () => {
  const a = arena();
  a.step(0.05);
  a.step(1.05);
  const clock = a.unit.native!.electroDragon!.clock;
  a.unit.native!.effects = { frozenUntil: 3.05 };
  a.step(2.05);
  expect(a.unit.native!.electroDragon!.clock).toBe(clock);
  expect(
    troopSoundCues(a.battle, new BattleSoundLog()).filter((c) => c.key.endsWith(':preAttack')),
  ).toEqual([]);
  a.step(3.1);
  expect(a.unit.native!.electroDragon!.clock).toBeCloseTo(clock + 0.05, 8);
  const pre = troopSoundCues(a.battle, new BattleSoundLog()).find((c) =>
    c.key.endsWith(':preAttack'),
  )!;
  expect(pre.at).toBeCloseTo(2.05, 8);
  a.step(4.9);
  expect(a.hits).toEqual([]);
  a.step(4.95);
  expect(a.hits[0].at).toBe(4.95);
});
it.each(['native chill', 'caller action time'] as const)(
  '%s scales the same charge clock',
  (mode) => {
    const a = arena();
    if (mode === 'native chill') a.unit.native!.effects = { chill: { until: 100, percent: 0.5 } };
    const ratio = mode === 'caller action time' ? 0.5 : 1;
    a.step(0.05, 1, ratio);
    a.step(5.75, 1, ratio);
    expect(a.hits).toEqual([]);
    a.step(5.8, 1, ratio);
    expect(a.hits[0].at).toBe(5.8);
  },
);
it('a dead defender cancels its charge and requires a fresh building wind-up', () => {
  const a = arena(),
    d = a.defender(-1, 7.4, 6.5);
  a.step(0.05);
  const key = a.unit.native!.electroDragon!.charge!.key;
  d.hp = 0;
  a.step(1.05);
  expect(a.unit.native!.electroDragon!.charge?.target).toEqual({ id: 2, building: true });
  expect(a.unit.native!.electroDragon!.charge!.key).not.toBe(key);
  a.step(2.95);
  expect(a.hits).toEqual([]);
  a.step(3.95);
  expect(a.hits[0]).toMatchObject({ id: 2, damage: 910 });
});
it('an alerted defender interrupts a building charge before retaliation begins', () => {
  const a = arena();
  a.step(0.05);
  const d = a.defender(-1, 7.4, 6.5, 'air');
  a.step(1.05);
  expect(a.unit.native!.electroDragon!.charge?.target).toEqual({ id: -1, building: false });
  a.step(2.95);
  expect(d.hp).toBe(5000);
  a.step(3.95);
  expect(d.hp).toBe(4090);
  expect(a.hits).toEqual([]);
});
it('a concealed building cancels the charge and clears its attack pose', () => {
  const a = arena();
  a.step(0.05);
  a.battle.buildingEffects = { [2]: { invisibleUntil: 10 } };
  a.step(1.05);
  expect(a.unit.native!.electroDragon!.charge).toBeUndefined();
  expect(a.unit.native!.electroDragon!.animAt).toBeUndefined();
  expect(a.hits).toEqual([]);
});
it('an engaged character target stays committed while the dragon chases outside range', () => {
  const a = arena(),
    d = a.defender(-1, 7.4, 6.5);
  a.step(0.05);
  d.x = 20;
  a.step(1.05);
  expect(a.unit.x).toBeGreaterThan(5);
  expect(a.unit.native!.electroDragon!.charge?.target.id).toBe(-1);
  a.step(2.95);
  expect(d.hp).toBe(4090);
});
it('the next hop follows the previous living character position', () => {
  const a = arena(),
    d = a.defender(-1, 7.4, 6.5, 'air');
  a.step(0.05);
  a.step(2.95);
  d.x = 16;
  a.pending(3.078);
  const zap = a.battle.nativeElectroDragonZaps![1];
  expect(zap).toMatchObject({
    fromX: 16,
    fromY: 6.5,
    fromAir: true,
    targetId: 4,
    targetBuilding: true,
  });
});
it('chain selection skips unborn, concealed, dead and out-of-range recipients', () => {
  const a = arena();
  for (const b of a.battle.buildings) if (b.id !== 2) b.hp = 0;
  const future = a.defender(-1, 9, 6.5),
    hidden = a.defender(-2, 9.1, 6.5),
    dead = a.defender(-3, 9.2, 6.5),
    outside = a.defender(-4, 11.501, 6.5);
  for (const d of [future, hidden, dead, outside]) d.alerted = false;
  future.spawnedAt = 3.079;
  hidden.invisibleUntil = 4;
  dead.hp = 0;
  a.step(0.05);
  a.step(2.95);
  a.pending(3.078);
  expect(a.battle.nativeElectroDragonArcs).toEqual([]);
  expect(a.hits).toHaveLength(1);
  expect([future.hp, hidden.hp, outside.hp]).toEqual([5000, 5000, 5000]);
});
it('the final clone’s committed chain completes before the raid ends', () => {
  const a = arena();
  a.battle.started = true;
  a.battle.remaining = emptyArmy();
  a.unit.native!.cloneUntil = 3;
  a.unit.summoned = true;
  a.step(0.05);
  a.step(2.95);
  a.model.step(0.05);
  expect(a.battle.finished).toBe(false);
  while (!a.battle.finished && a.battle.elapsed < 4) a.model.step(0.05);
  expect(a.battle.finished).toBe(true);
  expect(a.battle.nativeElectroDragonArcs).toEqual([]);
  expect(a.battle.nativeElectroDragonZaps?.filter((z) => z.sourceId === a.unit.id)).toHaveLength(5);
});
