import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { nativeUnitStats } from '../src/game/native-units';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { nativeDirectBattle } from './fixtures/native-direct-attacks';
import { superBarbarianRecording } from './fixtures/attacking-super-barbarian';
import { nativeTargetingSpellRecording } from './fixtures/native-targeting-spells';
import {
  unitDamageScale,
  unitSpeedBonus,
  unitAttackIntervalScale,
} from '../src/game/native-status';

for (let level = 1; level <= 9; level++)
  for (const x of [11.4, 6.9])
    it(`Super Barbarian ${level} charges after approaching from ${x} and resolves a direct swing`, () => {
      const r = nativeDirectBattle('superbarbarian', level, 195, x),
        target = r.battle.buildings.find((b) => b.id === 2)!,
        damage = nativeUnitStats('superbarbarian', level).damage * 1.7;
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed;
      expect(target.hp).toBe(target.maxHp);
      r.untilAttacks(1);
      const first = r.battle.elapsed;
      expect(first - engaged + 0.05).toBeCloseTo(0.7, 8);
      expect(target.hp).toBeCloseTo(target.maxHp - damage, 8);
      expect(r.battle.projectiles?.some((p) => p.sourceId === r.unit.id) ?? false).toBe(false);
      r.untilAttacks(2);
      expect(r.unit.native!.lastAttackAt! - first).toBeCloseTo(0.8, 8);
      expect(target.hp).toBeCloseTo(target.maxHp - 2 * damage, 8);
    });

it('a direct swing hits a ground defender once and ignores the air layer', () => {
  const r = nativeDirectBattle('superbarbarian', 1, 195),
    ground = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 12, 11.5, 0),
    air = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, 12, 11.5, 0);
  for (const d of [ground, air]) {
    d.alerted = true;
    d.stunnedUntil = 100;
  }
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed;
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(0.7, 8);
  expect(ground.hp).toBeCloseTo(ground.maxHp - 96 * 1.7, 8);
  expect(air.hp).toBe(air.maxHp);
});

it('Freeze and stun hold the fresh charge and repeat clock', () => {
  const r = nativeDirectBattle('superbarbarian', 1, 195);
  r.unit.x = 12.5;
  r.until(0.3);
  const before = structuredClone(r.unit.native!.attackWindup);
  (r.unit.native!.effects ??= {}).frozenUntil = 1.3;
  r.until(1);
  expect(r.unit.native!.attackWindup).toEqual(before);
  r.untilAttacks(1);
  expect(r.battle.elapsed).toBeCloseTo(1.7, 8);
  const first = r.battle.elapsed;
  r.step();
  r.unit.native!.effects!.stunUntil = r.battle.elapsed + 1;
  r.untilAttacks(2);
  expect(r.battle.elapsed - first).toBeCloseTo(1.8, 8);
});
for (const slowed of [false, true])
  it(`action modifiers scale both phases, slowed=${slowed}`, () => {
    const r = nativeDirectBattle('superbarbarian', 1, 195);
    r.unit.x = 12.5;
    (r.unit.native ??= {}).effects = slowed
      ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
      : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
    r.untilAttacks(1);
    const first = r.battle.elapsed,
      period = slowed ? 1.4 : 0.35;
    expect(first - period).toBeGreaterThanOrEqual(-1e-8);
    expect(first - period).toBeLessThan(0.05 + 1e-8);
    r.untilAttacks(5);
    expect(Math.abs(r.unit.native!.lastAttackAt! - first - 4 * (slowed ? 1.6 : 0.4))).toBeLessThan(
      0.05 + 1e-8,
    );
  });
it('retains sub-step remainder through successive melee releases', () => {
  const r = nativeDirectBattle('superbarbarian', 1, 195),
    releases: number[] = [];
  r.step();
  for (let n = 1; n <= 8; n++) {
    while ((r.unit.native!.attacks ?? 0) < n) r.model.step(0.08);
    releases.push(r.unit.native!.lastAttackAt!);
  }
  expect(Math.abs(releases[7] - releases[0] - 7 * 0.8)).toBeLessThan(0.08 + 1e-8);
});
it('a replacement target starts a fresh charge', () => {
  const r = nativeDirectBattle('superbarbarian', 1, 195),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  r.unit.x = 12.5;
  r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
  r.until(0.4);
  r.model.damage(target, target.hp);
  r.step();
  const changed = r.battle.elapsed;
  r.untilAttacks(1);
  expect(r.battle.elapsed - changed + 0.05).toBeCloseTo(0.7, 8);
  expect(r.unit.target).toBe(3);
});
it('opens a blocking Wall before continuing its ground route', () => {
  const r = nativeDirectBattle('superbarbarian', 1, 195, 6.9);
  r.battle.buildings.find((b) => b.id === 2)!.x = 22;
  const walls = Array.from({ length: 48 }, (_, y) => makeBuilding(1000 + y, 'wall', 12, y, 18));
  r.battle.buildings.push(...walls);
  r.untilAttacks(1);
  const wall = walls.find((w) => w.id === r.unit.native!.attackWindup!.target!.id)!;
  expect(wall).toBeDefined();
  expect(r.unit.x).toBeLessThan(12);
  expect(wall.hp).toBeCloseTo(wall.maxHp - 96 * 1.7, 8);
});

for (const version of [194, 195])
  for (const level of [1, 9])
    it(`tier ${level} actual Cannon fight preserves version ${version}`, () => {
      const r = superBarbarianRecording(version, level),
        viewer = new GameModel();
      expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        viewer.seekReplay(s.at);
        while (viewer.replay!.seeking) viewer.step(0.05);
        expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
      }
    });
it('only a carried Super Barbarian enables version 195', () => {
  const r = nativeDirectBattle('superbarbarian', 1, 195);
  expect(replayBattle(r.data.initial, 194).nativeSuperBarbarianWindup).toBeUndefined();
  expect(replayBattle(r.data.initial, 195).nativeSuperBarbarianWindup).toBe(true);
  r.data.initial.army.superbarbarian = 0;
  expect(replayBattle(r.data.initial, 195).nativeSuperBarbarianWindup).toBeUndefined();
});

for (let level = 1; level <= 9; level++)
  it(`tier ${level} Rage expires on its independent clock while Freeze holds a positive charge`, () => {
    const r = nativeDirectBattle('superbarbarian', level, 195),
      target = r.battle.buildings.find((b) => b.id === 2)!;
    r.unit.x = 12.5;
    r.until(0.2);
    const before = structuredClone(r.unit.native!.attackWindup),
      until = r.unit.native!.effects!.boost!.until,
      damage = nativeUnitStats('superbarbarian', level).damage;
    expect(until).toBeCloseTo(8.05, 8);
    expect(before).toMatchObject({ engaged: true });
    expect(before!.remaining).toBeGreaterThan(0);
    expect(unitDamageScale(r.unit, r.battle.elapsed)).toBe(1.7);
    expect(unitSpeedBonus(r.unit, r.battle.elapsed)).toBe(1.5);
    expect(unitAttackIntervalScale(r.unit, r.battle.elapsed)).toBe(1);
    r.unit.native!.effects!.frozenUntil = until + 0.1;
    r.until(until + 0.05);
    expect(r.unit.native!.attackWindup).toEqual(before);
    expect(r.unit.native!.attacks ?? 0).toBe(0);
    expect(unitDamageScale(r.unit, r.battle.elapsed)).toBe(1);
    expect(unitSpeedBonus(r.unit, r.battle.elapsed)).toBe(0);
    r.untilAttacks(1);
    const first = r.battle.elapsed;
    expect(target.hp).toBeCloseTo(target.maxHp - damage, 8);
    r.untilAttacks(2);
    expect(r.battle.elapsed - first).toBeCloseTo(0.8, 8);
    expect(target.hp).toBeCloseTo(target.maxHp - 2 * damage, 8);
  });
for (const version of [194, 195])
  for (const level of [1, 9])
    it(`tier ${level} actual Golem fight reconstructs full version ${version} states`, () => {
      const r = superBarbarianRecording(version, level, true),
        viewer = new GameModel();
      expect(r.defenderId).toBeDefined();
      expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        viewer.seekReplay(s.at);
        while (viewer.replay!.seeking) viewer.step(0.05);
        expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
      }
    });
for (const kind of ['bomb', 'airbomb', 'seekingairmine'] as const)
  it(`retains ${kind} trigger eligibility during its fresh charge`, () => {
    const r = nativeDirectBattle('superbarbarian'),
      trap = makeBuilding(3, kind, 11, 11, 1);
    r.battle.buildings.push(trap);
    r.step();
    expect(r.unit.native?.attacks ?? 0).toBe(0);
    expect(r.battle.traps[trap.id] !== undefined).toBe(kind === 'bomb');
  });
for (const version of [194, 195])
  for (const level of [1, 4])
    it(`actual Angry Spell ${level} redirects a charged Super Barbarian under version ${version}`, () => {
      const r = nativeTargetingSpellRecording('AngrySpell', level, version, 'superbarbarian'),
        viewer = new GameModel(),
        at = (t: number) =>
          r.snapshots.find((s) => s.at === t)!.battle as import('../src/game/model').Battle,
        pending = at(r.pending),
        u = pending.units.find((u) => u.id === r.unitId)!,
        after = at(r.impact),
        changed = after.units.find((u) => u.id === r.unitId)!;
      if (version >= 195) {
        expect(u.native!.attackWindup).toMatchObject({
          engaged: true,
          target: { id: 2, building: true },
        });
        expect(u.native!.attackWindup!.remaining).toBeGreaterThan(0);
        expect(changed.native!.attackWindup!.engaged).toBeUndefined();
        expect(changed.native!.attacks).toBe(u.native!.attacks);
        expect(after.buildings.find((b) => b.id === 2)!.hp).toBe(
          pending.buildings.find((b) => b.id === 2)!.hp,
        );
      }
      expect(changed.target).toBe(3);
      expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        viewer.seekReplay(s.at);
        while (viewer.replay!.seeking) viewer.step(0.05);
        expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
      }
    });
