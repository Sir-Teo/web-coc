import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Battle } from '../src/game/model';
import { vampstacheBattle, vampstacheRecording } from './fixtures/vampstache';
import { statsFor, stepNativeUnit, type NativeTroopContext } from '../src/game/native-troops';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

function swing(
  level = 18,
  target: 'building' | 'wall' | 'defender' = 'building',
  missing = 1000,
  cooldown = 0,
  version = 79,
) {
  const { battle, unit, hero } = vampstacheBattle(level, version);
  if (target !== 'defender') {
    battle.defenders = [];
    battle.buildings.push(makeBuilding(2, target === 'wall' ? 'wall' : 'airdefense', 6, 4, 16));
    unit.target = 2;
    unit.native!.targetAt = 0;
  } else battle.defenders![0].alerted = true;
  unit.hp = unit.maxHp - missing;
  unit.cooldown = cooldown;
  battle.elapsed = 1;
  const ctx: NativeTroopContext = {
    battle,
    buildings: battle.buildings,
    buildingsById: new Map(battle.buildings.map((b) => [b.id, b])),
    passableWalls: new Set(),
    nextId: () => 2000,
    troopLevel: () => 1,
    damageBuilding: (b, amount) => {
      b.hp = Math.max(0, b.hp - amount);
    },
    effect: () => {},
  };
  const stats = statsFor(battle, unit);
  const hp = unit.hp;
  stepNativeUnit(ctx, unit, { damage: stats.damage, speed: stats.speed }, 0.05);
  return { healed: unit.hp - hp, unit, hero, battle };
}

it.each([
  [1, 60],
  [3, 90],
  [6, 120],
  [9, 160],
  [12, 200],
  [15, 250],
  [18, 300],
])('heals the source level %s amount on a building swing', (level, heal) => {
  const result = swing(level);
  expect(result.unit.cooldown).toBeGreaterThan(0);
  expect(result.healed).toBe(heal);
});

it.each(['wall', 'defender'] as const)('heals once on a completed %s swing', (target) => {
  expect(swing(18, target).healed).toBe(300);
});

it('caps healing at maximum HP and does not heal during a held cooldown or after defeat', () => {
  expect(swing(18, 'building', 10).healed).toBe(10);
  expect(swing(18, 'defender', 1000, 1).healed).toBe(0);
  const { model, battle, unit } = vampstacheBattle();
  unit.hp = 0;
  battle.nativeHeroes![0].abilityUsed = true;
  model.step(0.05);
  expect(unit.hp).toBe(0);
});

it('preserves version 78 direct hits without life steal', () => {
  expect(swing(18, 'building', 1000, 0, 78).healed).toBe(0);
  expect(swing(18, 'defender', 1000, 0, 78).healed).toBe(0);
});

it.each([1, 18])(
  'reconstructs real level %s healing swings through portable backward seeks',
  (level) => {
    const { data, snapshots, strikes, final, unitId, heal } = vampstacheRecording(level);
    expect(strikes.length).toBeGreaterThanOrEqual(4);
    for (const strike of strikes) expect(strike.after! - strike.before).toBe(heal);
    const viewer = new GameModel();
    expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
    for (const snapshot of [...snapshots].reverse()) {
      viewer.seekReplay(snapshot.at);
      while (viewer.replay!.seeking) viewer.step(0.05);
      expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
    }
    const current = (snapshots.at(-1)!.battle as Battle).units.find((u) => u.id === unitId)!;
    expect(viewer.openReplay({ ...data, version: 78 })).toBe(true);
    viewer.seekReplay(final);
    while (viewer.replay!.seeking) viewer.step(0.05);
    const old = viewer.battle!.units.find((u) => u.id === unitId)!;
    expect(current.hp - old.hp).toBe(strikes.length * heal);
  },
);
