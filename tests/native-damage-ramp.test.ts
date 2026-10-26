import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Unit } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../src/game/replay';
import { nativeUnitStats } from '../src/game/native-units';
import { stepNativeUnit, type NativeTroopContext } from '../src/game/native-troops';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import type { FX } from '../src/game/model';
import { nativeDamageRampRecording } from './fixtures/native-damage-ramp';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

function arena(
  kind: 'infernodragon' | 'superminer',
  defender = false,
  version = REPLAY_VERSION,
  level = 1,
) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'goldstorage', 10, 10, 1),
  ];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = emptySpells();
  model.state.king = undefined;
  model.startBattle(0, true);
  const recording = (model as unknown as { recording: ReplayData }).recording;
  const battle = replayBattle(recording.initial, version);
  const stats = nativeUnitStats(kind, level);
  const unit: Unit = {
    id: 1000,
    kind,
    level,
    x: 9.5,
    y: 11.5,
    hp: stats.hp,
    maxHp: stats.hp,
    cooldown: 0,
    target: null,
    path: [],
    pathAt: 0,
    attacking: false,
    native: {},
  };
  battle.units = [unit];
  const target = defender
    ? spawnGarrisonDefender(battle, 'golem', 8, 2, 10, 11.5, 0)
    : battle.buildings[1];
  target.hp = target.maxHp = 1e6;
  if (target.kind === 'golem') target.alerted = true;
  const effects: FX[] = [];
  const ctx: NativeTroopContext = {
    battle,
    buildings: battle.buildings,
    buildingsById: new Map(battle.buildings.map((b) => [b.id, b])),
    passableWalls: new Set(),
    nextId: () => 2000,
    troopLevel: () => level,
    damageBuilding: (b, amount) => {
      b.hp -= amount;
    },
    effect: (fx) => effects.push(fx),
  };
  function step(at: number, ready = true) {
    battle.elapsed = at;
    if (ready) unit.cooldown = 0;
    unit.attacking = false;
    const hp = target.hp;
    stepNativeUnit(ctx, unit, stats, 0.05);
    return hp - target.hp;
  }
  return { battle, stats, unit, target, ctx, effects, step };
}

for (const kind of ['infernodragon', 'superminer'] as const) {
  for (const defender of [false, true]) {
    it(`${kind} uses all three source stages against ${defender ? 'defenders' : 'buildings'}`, () => {
      const { stats, step, unit, effects, battle } = arena(kind, defender);
      const ramp = stats.damageRamp!;
      expect(step(0)).toBeCloseTo(stats.damage, 7);
      expect(step(ramp.switchAt[0] - 0.001)).toBeCloseTo(stats.damage, 7);
      expect(step(ramp.switchAt[0])).toBeCloseTo(ramp.dps[1] * stats.rate, 7);
      expect(step(ramp.switchAt[1] - 0.001)).toBeCloseTo(ramp.dps[1] * stats.rate, 7);
      expect(step(ramp.switchAt[1])).toBeCloseTo(ramp.dps[2] * stats.rate, 7);
      expect(unit.cooldown).toBeCloseTo(stats.rate, 12);
      expect(battle.projectiles ?? []).toEqual([]);
      expect(effects.filter((fx) => fx.type === 'hit')).toHaveLength(5);
    });

    it(`${kind} resets on another ${defender ? 'defender' : 'building'} even when already in range`, () => {
      const { battle, stats, unit, target, ctx, step } = arena(kind, defender);
      step(0);
      step(4);
      if (defender) {
        const next = spawnGarrisonDefender(battle, 'golem', 8, 3, 10, 11.5, 0);
        next.hp = next.maxHp = 1e6;
        next.alerted = true;
        unit.defenderTarget = next.id;
        const hp = next.hp;
        step(4.1);
        expect(hp - next.hp).toBeCloseTo(stats.damage, 7);
      } else {
        const next = makeBuilding(3, 'goldstorage', 10, 13, 1);
        next.hp = next.maxHp = 1e6;
        battle.buildings.push(next);
        ctx.buildingsById.set(next.id, next);
        unit.y = 14.5;
        unit.target = next.id;
        const hp = next.hp;
        step(4.1);
        expect(hp - next.hp).toBeCloseTo(stats.damage, 7);
      }
      expect(target.hp).toBeLessThan(target.maxHp);
      expect(unit.native!.damageRamp!.startedAt).toBe(4.1);
    });

    it(`${kind} cools while pursuing a ${defender ? 'defender' : 'building'}`, () => {
      const { stats, unit, step } = arena(kind, defender);
      step(0);
      step(4);
      unit.x = 0;
      step(4.1);
      expect(unit.attacking).toBe(false);
      expect(unit.native!.damageRamp).toBeUndefined();
      unit.x = 9.5;
      expect(step(8)).toBeCloseTo(stats.damage, 7);
    });

    it(`${kind} starts source kill recovery on the direct ${defender ? 'defender' : 'building'} hit`, () => {
      const { stats, unit, target, step } = arena(kind, defender);
      target.hp = 1;
      step(0);
      expect(target.hp).toBeLessThanOrEqual(0);
      expect(unit.cooldown).toBe(Math.max(stats.rate, stats.damageRamp!.killedCooldown));
      expect(unit.native!.damageRamp).toBeUndefined();
    });
  }
}

it.each(['infernodragon', 'superminer'] as const)(
  'does not advance %s damage while its cooldown is held',
  (kind) => {
    const { unit, step } = arena(kind, true);
    unit.cooldown = 5;
    expect(step(0, false)).toBe(0);
    expect(step(4, false)).toBe(0);
    expect(unit.native!.damageRamp).toBeUndefined();
    expect(step(5)).toBeCloseTo(nativeUnitStats(kind, 1).damage, 7);
  },
);

for (const kind of ['infernodragon', 'superminer'] as const) {
  it.each([6, 12])(`${kind} inherits source ramp thresholds at level %s`, (level) => {
    const { stats, step } = arena(kind, true, undefined, level);
    expect(step(0)).toBeCloseTo(stats.damage, 7);
    expect(step(stats.damageRamp!.switchAt[0])).toBeCloseTo(
      stats.damageRamp!.dps[1] * stats.rate,
      7,
    );
    expect(step(stats.damageRamp!.switchAt[1])).toBeCloseTo(
      stats.damageRamp!.dps[2] * stats.rate,
      7,
    );
  });

  it(`${kind} applies damage boosts once to the selected stage`, () => {
    const { stats, unit, target, ctx, battle, step } = arena(kind, true);
    step(0);
    battle.elapsed = 4;
    unit.cooldown = 0;
    const hp = target.hp;
    stepNativeUnit(ctx, unit, { ...stats, damage: stats.damage * 2.3 }, 0.05);
    expect(hp - target.hp).toBeCloseTo(stats.damageRamp!.dps[2] * stats.rate * 2.3, 7);
  });

  it.each([false, true])(
    `${kind} reconstructs actual defenders=%s staged hits through portable backward seeks`,
    (defenders) => {
      const r = nativeDamageRampRecording(kind, defenders);
      const first = r.hits[0];
      expect(first.damage).toBeCloseTo(r.stats.damage, 7);
      const stage = r.hits.find((h) => h.at >= r.maximum - 1e-9)!;
      expect(stage.damage).toBeCloseTo(r.stats.damageRamp!.dps[2] * r.stats.rate, 7);
      const next = r.hits.find((h) => h.id !== first.id)!;
      expect(next.startedAt).toBe(next.at);
      expect(next.damage).toBeCloseTo(r.stats.damage, 7);
      expect(next.at - r.killedAt).toBeGreaterThanOrEqual(
        r.stats.damageRamp!.killedCooldown - 1e-9,
      );
      const viewer = new GameModel();
      expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const snapshot of [...r.snapshots].reverse()) {
        viewer.seekReplay(snapshot.at);
        while (viewer.replay!.seeking) viewer.step(0.05);
        expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
      }
    },
  );
}

it.each(['infernodragon', 'superminer'] as const)(
  'preserves version 93 %s defender packets and flat damage',
  (kind) => {
    const { battle, stats, effects, step } = arena(kind, true, 93);
    if (kind === 'infernodragon') {
      expect(step(0)).toBe(0);
      expect(step(4)).toBe(0);
      const shots = battle.projectiles!;
      expect(shots).toHaveLength(2);
      expect(shots.every((p) => p.damage === stats.damage)).toBe(true);
      expect(effects.filter((fx) => fx.type === 'projectile')).toHaveLength(2);
    } else {
      expect(step(0)).toBeCloseTo(stats.damage, 7);
      expect(step(4)).toBeCloseTo(stats.damage, 7);
      expect(battle.projectiles ?? []).toEqual([]);
    }
  },
);

it.each(['infernodragon', 'superminer'] as const)(
  'preserves version 93 %s heat across an in-range building switch',
  (kind) => {
    const { battle, stats, unit, ctx, step } = arena(kind, false, 93);
    step(0);
    step(4);
    const next = makeBuilding(3, 'goldstorage', 10, 13, 1);
    next.hp = next.maxHp = 1e6;
    battle.buildings.push(next);
    ctx.buildingsById.set(next.id, next);
    unit.y = 14.5;
    unit.target = next.id;
    const hp = next.hp;
    step(4.1);
    expect(hp - next.hp).toBeCloseTo(stats.damageRamp!.dps[2] * stats.rate, 7);
  },
);
