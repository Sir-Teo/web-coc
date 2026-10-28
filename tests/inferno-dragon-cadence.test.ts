import { infernoDragonRecording } from './fixtures/attacking-inferno-dragon';
import { GameModel } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { expect, it } from 'vitest';
import { nativeDirectBattle } from './fixtures/native-direct-attacks';
import { nativeUnitStats } from '../src/game/native-units';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { makeBuilding } from '../src/game/model';
import { replayBattle } from '../src/game/replay';
import { applyShrink } from '../src/game/shrink-trap';

for (let level = 1; level <= 12; level++)
  for (const x of [11.4, 6.9])
    it(`Inferno Dragon ${level} keeps source128ms remainders from ${x} through all ramp stages`, () => {
      const r = nativeDirectBattle('infernodragon', level, 209, x),
        target = r.battle.buildings.find((b) => b.id === 2)!,
        s = nativeUnitStats('infernodragon', level);
      const hp = target.hp;
      r.untilAttacks(1);
      const first = r.battle.elapsed;
      expect(first).toBeCloseTo(x === 11.4 ? 0.05 : 1.25, 8);
      expect(hp - target.hp).toBeCloseTo(s.damage, 7);
      expect(r.unit.native!.attackWindup).toBeUndefined();
      for (let n = 2; n <= 28; n++) {
        const before = target.hp;
        r.untilAttacks(n);
        const age = r.battle.elapsed - first,
          stage = age + 1e-9 >= 3.2 ? 2 : age + 1e-9 >= 1.7 ? 1 : 0;
        expect(age).toBeCloseTo(Math.ceil(((n - 1) * 0.128 - 1e-9) / 0.05) * 0.05, 8);
        expect(before - target.hp).toBeCloseTo(s.damageRamp!.dps[stage] * 0.128, 7);
      }
    });
for (const x of [11.4, 6.9])
  it(`version208 retains old150ms beam cadence from ${x}`, () => {
    const r = nativeDirectBattle('infernodragon', 1, 208, x);
    r.untilAttacks(1);
    const first = r.battle.elapsed;
    r.untilAttacks(20);
    expect(r.battle.elapsed - first).toBeCloseTo(19 * 0.15, 8);
    expect(r.battle.nativeInfernoDragonCadence).toBeUndefined();
  });
for (const mode of ['ground', 'air'] as const)
  it(`source cadence also applies to ${mode} defenders`, () => {
    const r = nativeDirectBattle('infernodragon', 1, 209),
      guard = spawnGarrisonDefender(
        r.battle,
        mode === 'ground' ? 'golem' : 'dragon',
        mode === 'ground' ? 8 : 7,
        1,
        11.9,
        11.5,
        0,
      );
    guard.alerted = true;
    guard.stunnedUntil = 100;
    guard.hp = guard.maxHp = 1e6;
    const hits: number[] = [];
    let hp = guard.hp;
    while (hits.length < 28) {
      r.step();
      if (guard.hp < hp) hits.push(r.battle.elapsed);
      hp = guard.hp;
    }
    for (let n = 1; n < hits.length; n++)
      expect(hits[n] - hits[0]).toBeCloseTo(Math.ceil((n * 0.128 - 1e-9) / 0.05) * 0.05, 8);
    expect(r.unit.native!.damageRamp).toMatchObject({
      targetId: guard.id,
      defender: true,
      startedAt: hits[0],
    });
  });
for (const hold of ['frozenUntil', 'stunUntil'] as const)
  it(`${hold} holds repeat time without banking attacks`, () => {
    const r = nativeDirectBattle('infernodragon', 1, 209);
    r.untilAttacks(1);
    const first = r.battle.elapsed;
    r.unit.native!.effects = { [hold]: first + 1.025 };
    r.untilAttacks(2);
    expect(r.battle.elapsed).toBeCloseTo(1.25, 8);
    const second = r.battle.elapsed;
    r.untilAttacks(5);
    expect(r.battle.elapsed - second).toBeCloseTo(0.35, 8);
  });
it('a killing beam keeps its source600ms recovery before the new target', () => {
  const r = nativeDirectBattle('infernodragon', 1, 209),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  target.hp = 1;
  const next = makeBuilding(3, 'goldstorage', 13, 13, 18);
  r.battle.buildings.push(next);
  r.untilAttacks(1);
  const killed = r.battle.elapsed;
  expect(r.unit.cooldown).toBeCloseTo(0.6, 8);
  expect(r.unit.native!.damageRamp).toBeUndefined();
  r.untilAttacks(2);
  expect(r.battle.elapsed - killed).toBeCloseTo(0.6, 8);
  expect(r.unit.native!.damageRamp).toMatchObject({ targetId: 3, startedAt: r.battle.elapsed });
  expect(next.hp).toBeCloseTo(next.maxHp - 7.04, 7);
});
it('a long approach to a replacement target discards its unused repeat debt', () => {
  const r = nativeDirectBattle('infernodragon', 1, 209),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  r.untilAttacks(10);
  r.unit.x = 1;
  r.step();
  expect(r.unit.native!.damageRamp).toBeUndefined();
  r.untilAttacks(11);
  const first = r.battle.elapsed,
    hp = target.hp;
  r.untilAttacks(12);
  expect(r.battle.elapsed - first).toBeCloseTo(0.15, 8);
  expect(hp - target.hp).toBeCloseTo(7.04, 7);
});
for (const slowed of [false, true])
  it(`native attack modifiers keep source remainders slowed=${slowed}`, () => {
    const r = nativeDirectBattle('infernodragon', 1, 209);
    r.untilAttacks(1);
    r.unit.native!.effects = slowed
      ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
      : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
    r.untilAttacks(2);
    const first = r.battle.elapsed;
    r.untilAttacks(20);
    expect(Math.abs(r.battle.elapsed - first - 18 * 0.128 * (slowed ? 2 : 0.5))).toBeLessThan(
      0.05 + 1e-8,
    );
  });
it('Shrink holds half the attack clock while keeping the beam hit value', () => {
  const r = nativeDirectBattle('infernodragon', 1, 209),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  applyShrink(r.unit, 0);
  r.untilAttacks(1);
  const first = r.battle.elapsed,
    hp = target.hp;
  r.untilAttacks(2);
  expect(r.battle.elapsed - first).toBeCloseTo(0.3, 8);
  expect(hp - target.hp).toBeCloseTo(7.04, 7);
  r.untilAttacks(8);
  expect(Math.abs(r.battle.elapsed - first - 7 * 0.256)).toBeLessThan(0.05 + 1e-8);
});
it('irregular80ms samples retain128ms remainders', () => {
  const r = nativeDirectBattle('infernodragon', 1, 209);
  r.model.step(0.08);
  const first = r.unit.native!.lastAttackAt!;
  while ((r.unit.native!.attacks ?? 0) < 20) r.model.step(0.08);
  expect(Math.abs(r.unit.native!.lastAttackAt! - first - 19 * 0.128)).toBeLessThan(0.08 + 1e-8);
});
it('only a carried Inferno Dragon enables the new cadence', () => {
  const r = nativeDirectBattle('infernodragon');
  expect(replayBattle(r.data.initial, 209).nativeInfernoDragonCadence).toBe(true);
  expect(replayBattle(r.data.initial, 208).nativeInfernoDragonCadence).toBeUndefined();
  r.data.initial.army.infernodragon = 0;
  expect(replayBattle(r.data.initial, 209).nativeInfernoDragonCadence).toBeUndefined();
});

for (const version of [208, 209])
  for (const level of [1, 12])
    for (const target of ['storage', 'golem', 'dragon'] as const)
      it(`actual Inferno Dragon ${level} ${target} retains complete portable states version${version}`, () => {
        const r = infernoDragonRecording(version, level, target),
          viewer = new GameModel();
        expect(r.second - r.first).toBeCloseTo(0.15, 8);
        expect(r.hits[3].at - r.first).toBeCloseTo(version === 209 ? 0.4 : 0.45, 8);
        expect(r.maximum - r.first).toBeCloseTo(version === 209 ? 3.2 : 3.3, 8);
        expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(
          true,
        );
        for (const snap of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          viewer.seekReplay(snap.at);
          while (viewer.replay!.seeking) viewer.step(0.05);
          expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snap.battle);
        }
      });

for (const hold of ['frozenUntil', 'stunUntil'] as const)
  it(`version208 retains its historical ${hold} cooldown during the hold`, () => {
    const r = nativeDirectBattle('infernodragon', 1, 208);
    r.untilAttacks(1);
    r.unit.native!.effects = { [hold]: r.battle.elapsed + 1.025 };
    r.untilAttacks(2);
    expect(r.battle.elapsed).toBeCloseTo(1.1, 8);
  });
it('Freeze also holds source kill recovery before the next beam starts', () => {
  const r = nativeDirectBattle('infernodragon', 1, 209),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  target.hp = 1;
  r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 13, 18));
  r.untilAttacks(1);
  r.unit.native!.effects = { frozenUntil: r.battle.elapsed + 1.025 };
  r.untilAttacks(2);
  expect(r.battle.elapsed).toBeCloseTo(1.7, 8);
  expect(r.unit.native!.damageRamp!.startedAt).toBeCloseTo(1.7, 8);
});
it('an army without Inferno Dragon keeps identical physical state across209', () => {
  const old = nativeDirectBattle('dragon', 1, 208),
    current = nativeDirectBattle('dragon', 1, 209);
  for (let n = 0; n < 100; n++) {
    old.step();
    current.step();
    expect(current.battle).toEqual(old.battle);
  }
});

it('a defender sharing the building id starts a fresh beam without inheriting its remainder', () => {
  const r = nativeDirectBattle('infernodragon', 1, 209);
  r.untilAttacks(4);
  const guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 11.9, 11.5, 0);
  guard.id = 2;
  guard.alerted = true;
  guard.stunnedUntil = 100;
  const hp = guard.hp;
  while (guard.hp === hp) r.step();
  expect(hp - guard.hp).toBeCloseTo(7.04, 7);
  expect(r.unit.cooldown).toBeCloseTo(0.128, 8);
  expect(r.unit.native!.damageRamp).toMatchObject({
    targetId: 2,
    defender: true,
    startedAt: r.battle.elapsed,
  });
  const first = r.battle.elapsed,
    previous = guard.hp;
  while (guard.hp === previous) r.step();
  expect(r.battle.elapsed - first).toBeCloseTo(0.15, 8);
});
