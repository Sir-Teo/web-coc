import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { nativeUnitStats } from '../src/game/native-units';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { replayBattle } from '../src/game/replay';
import { nativeTargetingSpellRecording } from './fixtures/native-targeting-spells';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { nativeDirectBattle } from './fixtures/native-direct-attacks';
import {
  barbarianRecording,
  frozenGolemBarbarianRecording,
  barbarianPuppetBattle,
  barbarianPuppetRecording,
} from './fixtures/attacking-barbarian';
import {
  unitDamageScale as damageScale,
  unitSpeedBonus as speedBoost,
  unitAttackIntervalScale as actionScale,
} from '../src/game/native-status';

for (let level = 1; level <= 13; level++)
  for (const x of [11.4, 6.9])
    it(`Barbarian ${level} charges after approaching from ${x} and resolves a direct swing`, () => {
      const r = nativeDirectBattle('swordsman', level, 192, x),
        target = r.battle.buildings.find((b) => b.id === 2)!,
        damage = nativeUnitStats('swordsman', level).damage;
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed;
      expect(target.hp).toBe(target.maxHp);
      r.untilAttacks(1);
      const first = r.battle.elapsed;
      expect(first - engaged + 0.05).toBeCloseTo(1, 8);
      expect(target.hp).toBe(target.maxHp - damage);
      expect(r.battle.projectiles?.some((p) => p.sourceId === r.unit.id) ?? false).toBe(false);
      r.untilAttacks(2);
      expect(r.unit.native!.lastAttackAt! - first).toBeCloseTo(1, 8);
      expect(target.hp).toBe(target.maxHp - 2 * damage);
    });

it('a direct swing hits a ground defender once and ignores the air layer', () => {
  const r = nativeDirectBattle('swordsman', 1, 192),
    ground = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 12, 11.5, 0),
    air = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, 12, 11.5, 0);
  for (const d of [ground, air]) {
    d.alerted = true;
    d.stunnedUntil = 100;
  }
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed;
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1, 8);
  expect(ground.hp).toBe(ground.maxHp - 9);
  expect(air.hp).toBe(air.maxHp);
});

it('Freeze and stun hold the fresh charge and repeat clock', () => {
  const r = nativeDirectBattle('swordsman', 1, 192);
  r.unit.x = 12.7;
  r.until(0.3);
  const before = structuredClone(r.unit.native!.attackWindup);
  (r.unit.native!.effects ??= {}).frozenUntil = 1.3;
  r.until(1);
  expect(r.unit.native!.attackWindup).toEqual(before);
  r.untilAttacks(1);
  expect(r.battle.elapsed).toBeCloseTo(2, 8);
  const first = r.battle.elapsed;
  r.step();
  r.unit.native!.effects!.stunUntil = r.battle.elapsed + 1;
  r.untilAttacks(2);
  expect(r.battle.elapsed - first).toBeCloseTo(2, 8);
});
for (const slowed of [false, true])
  it(`action modifiers scale both phases, slowed=${slowed}`, () => {
    const r = nativeDirectBattle('swordsman', 1, 192);
    r.unit.x = 12.7;
    (r.unit.native ??= {}).effects = slowed
      ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
      : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
    r.untilAttacks(1);
    const first = r.battle.elapsed,
      period = slowed ? 2 : 0.5;
    expect(first - period).toBeGreaterThanOrEqual(-1e-8);
    expect(first - period).toBeLessThan(0.05 + 1e-8);
    r.untilAttacks(5);
    expect(Math.abs(r.unit.native!.lastAttackAt! - first - 4 * period)).toBeLessThan(0.05 + 1e-8);
  });
it('retains sub-step remainder through successive melee releases', () => {
  const r = nativeDirectBattle('swordsman', 1, 192),
    releases: number[] = [];
  r.step();
  for (let n = 1; n <= 8; n++) {
    while ((r.unit.native!.attacks ?? 0) < n) r.model.step(0.08);
    releases.push(r.unit.native!.lastAttackAt!);
  }
  expect(Math.abs(releases[7] - releases[0] - 7 * 1)).toBeLessThan(0.08 + 1e-8);
});
it('a replacement target starts a fresh charge', () => {
  const r = nativeDirectBattle('swordsman', 1, 192),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  r.unit.x = 12.7;
  r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
  r.until(0.4);
  r.model.damage(target, target.hp);
  r.step();
  const changed = r.battle.elapsed;
  r.untilAttacks(1);
  expect(r.battle.elapsed - changed + 0.05).toBeCloseTo(1, 8);
  expect(r.unit.target).toBe(3);
});
it('opens a blocking Wall before continuing its ground route', () => {
  const r = nativeDirectBattle('swordsman', 1, 192, 6.9);
  r.battle.buildings.find((b) => b.id === 2)!.x = 22;
  const walls = Array.from({ length: 48 }, (_, y) => makeBuilding(1000 + y, 'wall', 12, y, 18));
  r.battle.buildings.push(...walls);
  r.untilAttacks(1);
  const wall = walls.find((w) => w.id === r.unit.native!.attackWindup!.target!.id)!;
  expect(wall).toBeDefined();
  expect(r.unit.x).toBeLessThan(12);
  expect(wall.hp).toBe(wall.maxHp - 9);
});

for (const version of [191, 192])
  for (const level of [1, 13])
    it(`tier ${level} actual Storage fight preserves version ${version}`, () => {
      const r = barbarianRecording(version, level),
        viewer = new GameModel();
      expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        viewer.seekReplay(s.at);
        while (viewer.replay!.seeking) viewer.step(0.05);
        expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
      }
    });
it('only a carried ordinary Barbarian enables version 192', () => {
  const r = nativeDirectBattle('swordsman', 1, 192);
  expect(replayBattle(r.data.initial, 191).nativeBarbarianWindup).toBeUndefined();
  expect(replayBattle(r.data.initial, 192).nativeBarbarianWindup).toBe(true);
  r.data.initial.army.swordsman = 0;
  expect(replayBattle(r.data.initial, 192).nativeBarbarianWindup).toBeUndefined();
});

for (const version of [191, 192])
  for (const level of [1, 13])
    it(`real Freeze and Golem preserve Barbarian tier ${level} under version ${version}`, () => {
      const r = frozenGolemBarbarianRecording(level, version),
        viewer = new GameModel(),
        born = r.snapshots[0].battle,
        guard = born.defenders!.find((d) => d.id === r.defenderId)!;
      expect(guard.frozenUntil).toBeGreaterThan(r.second);
      expect(born.nativeFreezeCasts!.some((s) => s.name === 'Freeze')).toBe(true);
      expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        viewer.seekReplay(s.at);
        while (viewer.replay!.seeking) viewer.step(0.05);
        expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
      }
    });

for (const version of [191, 192])
  for (const item of [1, 18])
    for (const level of [1, 13])
      it(`King Puppet ${item} preserves tier ${level} waves, given boost and version ${version}`, () => {
        const r = barbarianPuppetRecording(item, level, version),
          viewer = new GameModel(),
          born = r.snapshots[0].battle.units.filter((u) => u.kind === 'swordsman'),
          first = r.snapshots
            .find((s) => s.at === r.first)!
            .battle.units.find((u) => u.id === r.id)!,
          stock = r.snapshots
            .find((s) => s.at === r.fullStock)!
            .battle.units.filter((u) => u.kind === 'swordsman');
        expect(r.data.initial.army.swordsman).toBe(0);
        expect(born).toHaveLength(5);
        expect(stock).toHaveLength(item === 1 ? 8 : 44);
        expect(stock.every((u) => u.level === level && u.summoned)).toBe(true);
        expect(r.first - r.engaged + (version >= 192 ? 0.05 : 0)).toBeCloseTo(
          version >= 192 ? 1 : 0,
          8,
        );
        expect(r.release.damage).toBeCloseTo(
          nativeUnitStats('swordsman', level).damage * (item === 1 ? 2 : 3.2),
          8,
        );
        expect(damageScale(first, r.first)).toBeCloseTo(item === 1 ? 2 : 3.2, 8);
        expect(speedBoost(first, r.first)).toBeCloseTo(item === 1 ? 1.2 : 3.6, 8);
        expect(actionScale(first, r.first)).toBe(1);
        expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(
          true,
        );
        for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          viewer.seekReplay(s.at);
          while (viewer.replay!.seeking) viewer.step(0.05);
          expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
        }
      });

it('only an active Barbarian Puppet enables source charges without carried Barbarians', () => {
  const r = barbarianPuppetBattle();
  expect(replayBattle(r.data.initial, 192).nativeBarbarianWindup).toBe(true);
  expect(replayBattle(r.data.initial, 191).nativeBarbarianWindup).toBeUndefined();
  r.data.initial.heroes![0].items = [];
  expect(replayBattle(r.data.initial, 192).nativeBarbarianWindup).toBeUndefined();
  r.data.initial.heroes![0].items = [{ slug: 'rage-vial', level: 1 }];
  expect(replayBattle(r.data.initial, 192).nativeBarbarianWindup).toBeUndefined();
});
for (const item of [1, 18])
  it(`Puppet ${item} given boost expires on battle time while Freeze holds the charge`, () => {
    const r = barbarianPuppetBattle(item, 13);
    const initialIds = new Set(
      r.battle.units.filter((u) => u.kind === 'swordsman').map((u) => u.id),
    );
    while (!r.battle.units.some((u) => initialIds.has(u.id) && u.attacking)) {
      expect(r.battle.elapsed).toBeLessThan(5);
      r.model.step(0.05);
    }
    r.unit = r.battle.units.find((u) => initialIds.has(u.id) && u.attacking)!;
    r.model.step(0.2);
    expect(r.battle.elapsed).toBeLessThan(5);
    expect(r.unit.native!.effects!.boost!.until).toBe(20);
    expect(damageScale(r.unit, r.battle.elapsed)).toBeCloseTo(item === 1 ? 2 : 3.2, 8);
    expect(speedBoost(r.unit, r.battle.elapsed)).toBeCloseTo(item === 1 ? 1.2 : 3.6, 8);
    const before = structuredClone(r.unit.native!.attackWindup);
    expect(before!.engaged).toBe(true);
    expect(before!.remaining).toBeGreaterThan(0);
    while (r.battle.elapsed < 20.05 - 1e-9) {
      for (const u of r.battle.units)
        (u.native ??= {}).effects = { ...u.native?.effects, frozenUntil: 100 };
      r.model.step(0.05);
    }
    expect(r.unit.native!.attackWindup).toEqual(before);
    expect(r.unit.native!.attacks ?? 0).toBe(0);
    expect(damageScale(r.unit, r.battle.elapsed)).toBe(1);
    expect(speedBoost(r.unit, r.battle.elapsed)).toBe(0);
  });
for (const kind of ['bomb', 'airbomb', 'seekingairmine'] as const)
  it(`a charging Barbarian retains ${kind} trigger eligibility`, () => {
    const r = nativeDirectBattle('swordsman'),
      trap = makeBuilding(3, kind, 11, 11, 1);
    r.battle.buildings.push(trap);
    r.step();
    expect(r.unit.native?.attacks ?? 0).toBe(0);
    expect(r.battle.traps[trap.id] !== undefined).toBe(kind === 'bomb');
  });

for (const level of [1, 4])
  for (const version of [191, 192])
    it(`actual Angry Spell ${level} interrupts a pending Barbarian charge under version ${version}`, () => {
      const r = nativeTargetingSpellRecording('AngrySpell', level, version),
        viewer = new GameModel(),
        at = (t: number) =>
          r.snapshots.find((s) => s.at === t)!.battle as import('../src/game/model').Battle,
        pending = at(r.pending),
        u = pending.units.find((u) => u.id === r.unitId)!,
        after = at(r.impact),
        changed = after.units.find((u) => u.id === r.unitId)!,
        mine = after.buildings.find((b) => b.id === 2)!;
      if (version >= 192) {
        expect(u.native!.attackWindup).toMatchObject({
          engaged: true,
          target: { id: 2, building: true },
        });
        expect(u.native!.attackWindup!.remaining).toBeGreaterThan(0);
        expect(changed.native!.attackWindup!.engaged).toBeUndefined();
        expect(changed.native!.attackWindup!.target).toBeUndefined();
        expect(changed.native!.attacks ?? 0).toBe(0);
        expect(mine.hp).toBe(mine.maxHp);
      } else expect(mine.maxHp - mine.hp).toBe(9);
      expect(changed.target).toBe(3);
      expect(changed.native!.angryUntil).toBeGreaterThan(after.elapsed);
      expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        viewer.seekReplay(s.at);
        while (viewer.replay!.seeking) viewer.step(0.05);
        expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
      }
    });
