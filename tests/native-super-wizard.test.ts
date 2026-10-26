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
  const unit = spawnNativeUnit(ctx, 'superwizard', level, 5, 6.5, 0),
    stats = nativeUnitStats('superwizard', level);
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
  'Super Wizard %s branches to nine targets at 40% after one source delay',
  (level) => {
    const a = arena(level);
    const children = Array.from({ length: 12 }, (_, i) =>
      a.defender(-1 - i, 8.5, 7 + i * 0.1, i % 2 ? 'air' : 'ground'),
    );
    for (const d of children) d.alerted = false;
    a.step(0.05);
    expect(a.hits).toEqual([{ id: 2, damage: a.stats.damage, at: 0.05 }]);
    expect(a.battle.nativeSuperWizardZaps).toHaveLength(1);
    a.pending(0.177);
    expect(children.every((d) => d.hp === 5000)).toBe(true);
    a.pending(0.178);
    const zaps = a.battle.nativeSuperWizardZaps!;
    expect(zaps).toHaveLength(10);
    expect(zaps.slice(1).every((z) => Math.abs(z.at - 0.178) < 1e-9)).toBe(true);
    expect(zaps.slice(1).every((z) => z.fromX === 8.5 && z.fromY === 6.5)).toBe(true);
    expect(children.filter((d) => d.hp < 5000)).toHaveLength(9);
    for (const d of children.filter((d) => d.hp < 5000))
      expect(d.hp).toBeCloseTo(5000 - a.stats.damage * 0.4, 8);
    expect(a.battle.projectiles ?? []).toEqual([]);
  },
);
it('branches from a defending air primary through structures and ground defenders without a generic arrow', () => {
  const a = arena(),
    primary = a.defender(-1, 7.4, 6.5, 'air'),
    other = a.defender(-2, 9.9, 8);
  a.step(0.05);
  expect(primary.hp).toBe(5000 - a.stats.damage);
  expect(a.battle.projectiles ?? []).toEqual([]);
  a.pending(0.178);
  expect(a.hits[0]).toMatchObject({ id: 2, damage: a.stats.damage * 0.4 });
  expect(other.hp).toBeCloseTo(5000 - a.stats.damage * 0.4, 8);
});
it('does not chain from a secondary to a target outside the primary radius', () => {
  const a = arena();
  a.step(0.05);
  a.pending(0.178);
  a.pending(2);
  expect(a.hits.map((h) => h.id)).toEqual([2, 3]);
});
it('all branches retain outgoing damage after the caster disappears and the primary is destroyed', () => {
  const a = arena(10);
  a.battle.buildings[1].hp = 1;
  a.step(0.05, 2.9);
  a.battle.units = [];
  a.pending(0.178);
  expect(a.hits[1]).toMatchObject({ id: 3, at: 0.178 });
  expect(a.hits[1].damage).toBeCloseTo(a.stats.damage * 2.9 * 0.4, 8);
});
it('excludes future, hidden and dead defenders plus walls and traps from branches', () => {
  const a = arena();
  for (const b of a.battle.buildings) if (b.id !== 2) b.hp = 0;
  const future = a.defender(-1, 9, 6.5),
    hidden = a.defender(-2, 9.1, 6.5),
    dead = a.defender(-3, 9.2, 6.5);
  for (const d of [future, hidden, dead]) d.alerted = false;
  future.spawnedAt = 0.179;
  hidden.invisibleUntil = 1;
  dead.hp = 0;
  a.battle.buildings.push(makeBuilding(90, 'wall', 9, 6, 1), makeBuilding(91, 'bomb', 9, 7, 1));
  a.step(0.05);
  a.pending(0.178);
  expect(a.battle.nativeSuperWizardZaps).toHaveLength(1);
  expect(a.hits).toHaveLength(1);
});
it('version 109 preserves its former primary-only building and generic defender shots', () => {
  const a = arena(1, 109);
  a.step(0.05);
  a.pending(0.178);
  expect(a.hits).toHaveLength(1);
  expect(a.battle.nativeSuperWizardZaps).toBeUndefined();
  const b = arena(1, 109);
  b.defender(-1, 7.4, 6.5, 'air');
  b.step(0.05);
  expect(b.battle.projectiles![0]).toMatchObject({ weapon: 'arrow' });
});

it('a surviving primary supplies its moved position for every branch', () => {
  const a = arena(),
    primary = a.defender(-1, 7.4, 6.5, 'air');
  a.step(0.05);
  primary.x = 16;
  a.pending(0.178);
  const branches = a.battle.nativeSuperWizardZaps!.slice(1);
  expect(branches.length).toBeGreaterThan(0);
  expect(branches.every((z) => z.fromX === 16 && z.fromY === 6.5 && z.fromAir)).toBe(true);
  expect(branches.some((z) => z.targetId === 4 && z.targetBuilding)).toBe(true);
});
it('secondary ties use stable ids, not maximum HP', () => {
  const a = arena();
  for (const b of a.battle.buildings) if (b.id !== 2) b.hp = 0;
  const first = a.defender(-2, 10.5, 6.5),
    second = a.defender(-1, 8.5, 8.5);
  first.maxHp = 1000;
  second.maxHp = 9000;
  first.alerted = second.alerted = false;
  a.step(0.05);
  a.pending(0.178);
  expect(a.battle.nativeSuperWizardZaps!.slice(1).map((z) => z.targetId)).toEqual([-2, -1]);
});
it('a blocking Wall can be the primary, but secondary Walls and traps cannot branch', () => {
  const a = arena();
  const wall = a.battle.buildings[1];
  wall.kind = 'wall';
  wall.y = 6;
  const primary = a.defender(-1, 17.8, 6.5);
  a.unit.defenderTarget = primary.id;
  a.unit.path = [{ x: 7.5, y: 6.5 }];
  a.unit.pathAt = 1;
  a.step(0.05);
  a.pending(0.178);
  expect(a.hits[0]).toMatchObject({ id: 2, damage: a.stats.damage });
  expect(a.battle.nativeSuperWizardZaps![0]).toMatchObject({ targetId: 2, targetBuilding: true });
});
it('committed branches complete before the final clone ends the raid', () => {
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
  expect(a.battle.nativeSuperWizardBranches).toEqual([]);
  expect(a.battle.nativeSuperWizardZaps).toHaveLength(2);
});
