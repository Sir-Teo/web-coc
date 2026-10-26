import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Unit } from '../src/game/model';
import { heroDefenderBattle } from './fixtures/hero-defender-attacks';
import { diggyStunRecording } from './fixtures/diggy-surface-stun';
import { defendingHero } from '../src/game/defending-heroes';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { createGuardian } from '../src/game/native-guardians';
import type { Defender } from '../src/game/defenders';
import { noteBuildingDamage } from '../src/game/native-defenses';
import { buildingDisabled, unitHidden } from '../src/game/native-status';
import { nativeUnitStats } from '../src/game/native-units';
import {
  spawnNativeUnit,
  stepNativeUnit,
  type NativeTroopContext,
} from '../src/game/native-troops';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

function arena(level = 1, version?: number, kind: Unit['kind'] = 'diggy') {
  const { battle } = heroDefenderBattle('queen', 1, [], version);
  battle.defenders = [];
  const cannon = makeBuilding(2, 'cannon', 8, 5, 21);
  battle.buildings.push(cannon);
  const ctx: NativeTroopContext = {
    battle,
    buildings: battle.buildings,
    buildingsById: new Map(battle.buildings.map((b) => [b.id, b])),
    passableWalls: new Set(),
    nextId: () => 3000,
    troopLevel: () => 1,
    damageBuilding: (b, damage, at = battle.elapsed) => {
      b.hp = Math.max(0, b.hp - damage);
      noteBuildingDamage(battle, b, at, false);
    },
    effect: () => {},
  };
  const unit = spawnNativeUnit(ctx, kind, level, 7.5, 6.5, 0);
  const s = nativeUnitStats(kind, level);
  const step = (at = battle.elapsed) => {
    battle.elapsed = at;
    unit.attacking = false;
    stepNativeUnit(ctx, unit, { damage: s.damage, speed: s.speed }, 0.05);
  };
  return { battle, cannon, ctx, unit, step };
}

it.each([
  [1, 2],
  [4, 2],
  [5, 2.5],
  [9, 2.5],
  [10, 3],
])('uses pinned Diggy level %s stun duration %ss on surfacing', (level, duration) => {
  const { battle, cannon, unit, step } = arena(level);
  battle.defenseTargets[cannon.id] = unit.id;
  step(1);
  expect(battle.buildingEffects![cannon.id].stunUntil).toBe(1 + duration);
  expect(battle.defenseStuns[cannon.id]).toBe(1 + duration);
  expect(battle.defenseTargets[cannon.id]).toBeUndefined();
  expect(battle.buildingEffects![cannon.id].frozenUntil).toBeUndefined();
  expect(unit.native).toMatchObject({ surfaced: true, burrowed: false });
  expect(buildingDisabled(battle, cannon, 1 + duration - 0.001)).toBe(true);
  expect(buildingDisabled(battle, cannon, 1 + duration)).toBe(false);
});

it('surfaces and stuns even while waiting for its next attack', () => {
  const { battle, cannon, unit, step } = arena();
  unit.cooldown = 1;
  step();
  expect(cannon.hp).toBe(cannon.maxHp);
  expect(battle.defenseStuns[cannon.id]).toBe(2);
  expect(unit.native?.surfaced).toBe(true);
});

it('does not refresh the stun on repeated surfaced hits', () => {
  const { battle, cannon, unit, step } = arena();
  step();
  unit.cooldown = 0;
  step(1.1);
  expect(cannon.hp).toBeLessThan(cannon.maxHp);
  expect(battle.defenseStuns[cannon.id]).toBe(2);
  unit.cooldown = 0;
  step(2.2);
  expect(buildingDisabled(battle, cannon, battle.elapsed)).toBe(false);
});

it('burrows on leaving building range and can stun on a later emergence', () => {
  const { battle, cannon, unit, step } = arena();
  step();
  unit.x = 5;
  step(0.5);
  expect(unit.native).toMatchObject({ surfaced: false, burrowed: true });
  expect(unitHidden(unit, battle.elapsed)).toBe(true);
  unit.x = 7.5;
  step(1);
  expect(battle.defenseStuns[cannon.id]).toBe(3);
  expect(unitHidden(unit, battle.elapsed)).toBe(false);
});

it('stuns a new adjacent defense after the previous target is destroyed', () => {
  const { battle, cannon, ctx, step } = arena();
  step();
  cannon.hp = 0;
  const next = { ...makeBuilding(3, 'archertower', 8, 5, 21) };
  battle.buildings.push(next);
  ctx.buildingsById.set(next.id, next);
  step(1);
  expect(battle.defenseStuns[next.id]).toBe(3);
});

it('preserves a longer existing defense stun', () => {
  const { battle, cannon, step } = arena();
  battle.buildingEffects = { [cannon.id]: { stunUntil: 10 } };
  battle.defenseStuns[cannon.id] = 10;
  step();
  expect(battle.buildingEffects[cannon.id].stunUntil).toBe(10);
  expect(battle.defenseStuns[cannon.id]).toBe(10);
});

it('does not emerge or stun while frozen underground', () => {
  const { battle, cannon, unit, step } = arena();
  unit.native!.effects = { frozenUntil: 1 };
  step(0.5);
  expect(battle.defenseStuns[cannon.id]).toBeUndefined();
  expect(unit.native?.burrowed).toBe(true);
  step(1);
  expect(battle.defenseStuns[cannon.id]).toBe(3);
});

it('surfaces against resources without applying a defense stun', () => {
  const { battle, cannon, ctx, unit, step } = arena();
  const storage = makeBuilding(3, 'goldstorage', 8, 5, 15);
  cannon.hp = 0;
  battle.buildings.push(storage);
  ctx.buildingsById.set(storage.id, storage);
  unit.target = storage.id;
  step();
  expect(unit.native?.surfaced).toBe(true);
  expect(battle.defenseStuns[storage.id]).toBeUndefined();
});

it.each([
  [12, true],
  [17, false],
  [17, true],
  [18, true],
] as const)('stuns Town Hall %s only if an actual weapon is active=%s', (level, active) => {
  const { battle, cannon, ctx, unit, step } = arena();
  cannon.hp = 0;
  const th = battle.buildings[0];
  th.level = level;
  th.x = 8;
  th.y = 5;
  unit.target = th.id;
  if (active)
    battle.nativeDefenses = { [th.id]: { clock: 0, readyAt: 0, targets: [], awakeAt: 0 } };
  step();
  expect(battle.defenseStuns[th.id]).toBe(active && level < 18 ? 2 : undefined);
  expect(ctx.buildingsById.get(th.id)).toBe(th);
});

it.each([false, true])('does not stun a defending air=%s Hero on surfacing', (air) => {
  const { battle, unit, step } = arena();
  const enemy = defendingHero({ kind: air ? 'prince' : 'king', level: 1, x: 7.6, y: 6.5 }, 0);
  enemy.alerted = true;
  battle.defenders = [enemy];
  unit.defenderTarget = enemy.id;
  step();
  expect(enemy.stunnedUntil).toBeUndefined();
  expect(enemy.frozenUntil).toBeUndefined();
});

it('does not grant the Diggy stun to an ordinary Miner', () => {
  const { battle, cannon, step } = arena(1, undefined, 'miner');
  step();
  expect(battle.defenseStuns[cannon.id]).toBeUndefined();
});

it.each(['garrison', 'guardian'] as const)('does not stun an actual %s defender', (kind) => {
  const { battle, unit, step } = arena();
  let enemy: Defender;
  if (kind === 'garrison') enemy = spawnGarrisonDefender(battle, 'archer', 9, 2, 7.6, 6.5, 0);
  else {
    enemy = createGuardian(battle, battle.buildings[0], -20000)!;
    enemy.phase = 'fighting';
    enemy.spawnedAt = 0;
    enemy.x = 7.6;
    enemy.y = 6.5;
  }
  enemy.alerted = true;
  battle.defenders = [enemy];
  unit.defenderTarget = enemy.id;
  step();
  expect(enemy.hp).toBeLessThan(enemy.maxHp);
  expect(unit.native?.surfaced).toBe(true);
  expect(enemy.stunnedUntil).toBeUndefined();
});

it('preserves version 89 defense activity and its previous building exposure', () => {
  const { battle, cannon, unit, step } = arena(1, 89);
  step();
  expect(battle.defenseStuns[cannon.id]).toBeUndefined();
  unit.x = 5;
  step(0.5);
  expect(unit.native?.surfaced).toBe(true);
});

it.each([1, 10])(
  'reconstructs actual level %s Diggy stuns and recovery in portable backward seeks',
  (level) => {
    const r = diggyStunRecording(level);
    expect(r.attacks.length).toBeGreaterThanOrEqual(2);
    expect(r.cannonShots.filter((at) => at > r.surfaced + 1e-9 && at < r.until - 1e-9)).toEqual([]);
    const viewer = new GameModel();
    expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const snapshot of [...r.snapshots].reverse()) {
      viewer.seekReplay(snapshot.at);
      while (viewer.replay!.seeking) viewer.step(0.05);
      expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
    }
  },
);
