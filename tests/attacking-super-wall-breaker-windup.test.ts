import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { nativeUnitStats } from '../src/game/native-units';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { hurtUnit } from '../src/game/native-status';
import { applyShrink } from '../src/game/shrink-trap';
import { nativeDirectBattle } from './fixtures/native-direct-attacks';
import { nativeTargetingSpellRecording } from './fixtures/native-targeting-spells';
import { superWallBreakerRecording } from './fixtures/attacking-super-wall-breaker';

for (let level = 1; level <= 10; level++)
  for (const x of [11.4, 6.9])
    it(`Super Wall Breaker ${level} spends a full one-second charge after reaching range from ${x}`, () => {
      const r = nativeDirectBattle('superwallbreaker', level, 205, x),
        target = r.battle.buildings.find((b) => b.id === 2)!,
        stats = nativeUnitStats('superwallbreaker', level);
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed;
      expect(target.hp).toBe(target.maxHp);
      expect(r.unit.hp).toBeGreaterThan(0);
      expect(r.unit.native!.attackWindup!.animationOffset).toBeLessThan(0);
      r.untilAttacks(1);
      expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1, 8);
      expect(r.unit.hp).toBe(0);
      expect(target.hp).toBe(target.maxHp - stats.damage);
      r.step();
      expect(target.hp).toBe(target.maxHp - stats.damage - stats.deathDamage);
      expect(r.unit.native!.attacks).toBe(1);
    });

it('Freeze and stun hold a pending single-attack charge', () => {
  const r = nativeDirectBattle('superwallbreaker', 10, 205);
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed;
  r.until(engaged + 0.2);
  const before = structuredClone(r.unit.native!.attackWindup);
  r.unit.native!.effects = { frozenUntil: r.battle.elapsed + 1 };
  r.until(r.battle.elapsed + 0.95);
  expect(r.unit.native!.attackWindup!.remaining).toBe(before!.remaining);
  r.unit.native!.effects.stunUntil = r.battle.elapsed + 1;
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(2.95, 8);
});

for (const slowed of [false, true])
  it(`action-rate modifiers scale the fresh charge, slowed=${slowed}`, () => {
    const r = nativeDirectBattle('superwallbreaker', 10, 205);
    r.unit.native!.effects = slowed
      ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
      : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed;
    r.untilAttacks(1);
    expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(slowed ? 2 : 0.5, 8);
  });

it('a replacement building starts a new charge after a pending target is destroyed', () => {
  const r = nativeDirectBattle('superwallbreaker', 10, 205),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
  while (!r.unit.attacking) r.step();
  r.until(r.battle.elapsed + 0.2);
  r.model.damage(target, target.hp);
  r.step();
  const changed = r.battle.elapsed;
  r.untilAttacks(1);
  expect(r.unit.target).toBe(3);
  expect(r.battle.elapsed - changed + 0.05).toBeCloseTo(1, 8);
});

it('defenders cannot interrupt its committed building charge', () => {
  const r = nativeDirectBattle('superwallbreaker', 10, 205);
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed,
    guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, r.unit.x, r.unit.y, r.battle.elapsed);
  guard.alerted = true;
  guard.stunnedUntil = 100;
  r.untilAttacks(1);
  expect(r.unit.defenderTarget).toBeUndefined();
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1, 8);
  expect(guard.hp).toBe(guard.maxHp);
  r.step();
  expect(guard.hp).toBe(guard.maxHp - 413);
});

it('defeat during a pending charge resolves only the casualty blast', () => {
  const r = nativeDirectBattle('superwallbreaker', 10, 205),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  while (!r.unit.attacking) r.step();
  r.until(r.battle.elapsed + 0.2);
  hurtUnit(r.battle, r.unit, r.unit.hp);
  r.step();
  expect(r.unit.native!.attacks).toBeUndefined();
  expect(target.hp).toBe(target.maxHp);
  r.step();
  expect(target.hp).toBe(target.maxHp - 413);
  r.until(r.battle.elapsed + 1);
  expect(target.hp).toBe(target.maxHp - 413);
});

it('Shrink scales the full charge while retaining attack and death damage', () => {
  const r = nativeDirectBattle('superwallbreaker', 10, 205),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  applyShrink(r.unit, 0);
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed;
  expect(r.unit.maxHp).toBe(575);
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(2, 8);
  expect(target.hp).toBe(target.maxHp - 170);
  r.step();
  expect(target.hp).toBe(target.maxHp - 170 - 413);
});

for (const kind of ['bomb', 'airbomb', 'seekingairmine'] as const)
  it(`retains ${kind} trigger eligibility during approach and charge`, () => {
    const r = nativeDirectBattle('superwallbreaker', 10, 205),
      trap = makeBuilding(3, kind, 11, 11, 1);
    r.battle.buildings.push(trap);
    r.step();
    expect(r.unit.native!.attacks ?? 0).toBe(0);
    expect(r.battle.traps[trap.id] !== undefined).toBe(kind === 'bomb');
  });

for (const version of [204, 205])
  for (const level of [1, 10])
    for (const target of ['storage', 'cannon', 'wall'] as const)
      it(`tier ${level} ${target} preserves complete version ${version} portable states`, () => {
        const r = superWallBreakerRecording(version, level, target, target === 'wall' ? 6.9 : 11.4),
          viewer = new GameModel();
        expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(
          true,
        );
        for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          viewer.seekReplay(s.at);
          while (viewer.replay!.seeking) viewer.step(0.05);
          expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
        }
      });

it('only a carried Super Wall Breaker enables the new attack phase', () => {
  const r = nativeDirectBattle('superwallbreaker');
  expect(replayBattle(r.data.initial, 204).nativeSuperWallBreakerWindup).toBeUndefined();
  expect(replayBattle(r.data.initial, 205).nativeSuperWallBreakerWindup).toBe(true);
  r.data.initial.army.superwallbreaker = 0;
  expect(replayBattle(r.data.initial, 205).nativeSuperWallBreakerWindup).toBeUndefined();
});

for (const version of [204, 205])
  for (const level of [1, 4])
    it(`actual Angry Spell ${level} preserves version ${version}'s pending charge and retarget states`, () => {
      const r = nativeTargetingSpellRecording(
          'AngrySpell',
          level,
          version,
          'superwallbreaker',
          2,
          0.1,
        ),
        pending = r.snapshots.find((s) => s.at === r.pending)!
          .battle as import('../src/game/model').Battle,
        after = r.snapshots.find((s) => s.at === r.impact)!
          .battle as import('../src/game/model').Battle,
        u = after.units.find((u) => u.id === r.unitId)!,
        viewer = new GameModel();
      if (version === 205) {
        expect(pending.units.find((u) => u.id === r.unitId)!.native!.attackWindup).toMatchObject({
          engaged: true,
          target: { id: 2, building: true },
        });
        expect(u.native!.attackWindup!.engaged).toBeUndefined();
        expect(u.native!.attacks ?? 0).toBe(0);
        expect(u.target).toBe(3);
      }
      expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        viewer.seekReplay(s.at);
        while (viewer.replay!.seeking) viewer.step(0.05);
        expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
      }
    });
