import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { nativeUnitStats, nativeUnitRow } from '../src/game/native-units';
import { nativeTroopFacingTarget } from '../src/game/native-troop-facing';
import { splitTiming } from '../src/game/garrison-kinds';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { attackingPekkaBattle, attackingPekkaRecording } from './fixtures/attacking-pekka';

for (let level = 1; level <= 13; level++)
  for (const x of [11.4, 6.9])
    it(`Pekka ${level} uses full source windup and period from x=${x}`, () => {
      const r = attackingPekkaBattle(level, undefined, x),
        stats = nativeUnitStats('pekka', level),
        timing = splitTiming(nativeUnitRow('pekka', level));
      expect(timing).toMatchObject({ period: 1.8, recovery: 0.3, firstHit: 1.5 });
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed,
        target = r.battle.buildings.find((b) => b.id === 2)!,
        hp = target.hp;
      expect(r.unit.native!.attacks ?? 0).toBe(0);
      r.untilAttacks(1);
      const first = r.battle.elapsed;
      expect(first - engaged + 0.05).toBeCloseTo(1.5, 8);
      expect(target.hp).toBeCloseTo(hp - stats.damage, 8);
      r.untilAttacks(2);
      expect(r.battle.elapsed - first).toBeCloseTo(1.8, 8);
    });
it('Pekka Freeze holds both fresh windup and recovery', () => {
  const r = attackingPekkaBattle();
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed;
  (r.unit.native!.effects ??= {}).frozenUntil = engaged + 1;
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(2.5, 8);
  const first = r.battle.elapsed;
  r.step();
  r.unit.native!.effects.frozenUntil = r.battle.elapsed + 1;
  r.untilAttacks(2);
  expect(r.battle.elapsed - first).toBeCloseTo(2.8, 8);
});
it('Pekka retargeting spends the remaining recovery once', () => {
  const r = attackingPekkaBattle();
  r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
  r.untilAttacks(1);
  const first = r.battle.elapsed,
    target = r.battle.buildings.find((b) => b.id === 2)!;
  r.model.damage(target, target.hp);
  r.untilAttacks(2);
  expect(r.unit.target).toBe(3);
  expect(r.battle.elapsed - first).toBeCloseTo(1.8, 8);
});
it('Pekka can interrupt a building windup for an alerted defender', () => {
  const r = attackingPekkaBattle();
  while (!r.unit.attacking) r.step();
  const target = r.battle.buildings.find((b) => b.id === 2)!,
    hp = target.hp,
    guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, r.unit.x + 0.1, r.unit.y, 0);
  guard.alerted = true;
  guard.stunnedUntil = 100;
  r.step();
  const engaged = r.battle.elapsed;
  expect(r.unit.native!.attackWindup!.target).toEqual({ id: guard.id, building: false });
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1.5, 8);
  expect(target.hp).toBe(hp);
  expect(guard.hp).toBeCloseTo(guard.maxHp - nativeUnitStats('pekka', 1).damage, 8);
});
for (const slowed of [false, true])
  it(`Pekka scales both phases, slowed=${slowed}`, () => {
    const r = attackingPekkaBattle();
    (r.unit.native ??= {}).effects = slowed
      ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
      : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed,
      scale = slowed ? 2 : 0.5;
    r.untilAttacks(1);
    const first = r.battle.elapsed;
    expect(first - engaged + 0.05).toBeCloseTo(1.5 * scale, 8);
    r.untilAttacks(2);
    expect(r.battle.elapsed - first).toBeCloseTo(1.8 * scale, 8);
  });
for (const x of [11.4, 6.9])
  it(`version 163 keeps Pekka's immediate first hit from x=${x}`, () => {
    const r = attackingPekkaBattle(1, 163, x),
      hp = r.battle.buildings.find((b) => b.id === 2)!.hp;
    while (!r.unit.attacking) r.step();
    expect(r.battle.buildings.find((b) => b.id === 2)!.hp).toBeCloseTo(
      hp - nativeUnitStats('pekka', 1).damage,
      8,
    );
    expect(r.unit.native?.attackWindup).toBeUndefined();
  });
for (const siege of [false, true])
  for (const version of [163, 164])
    it(`actual ${siege ? 'Siege Barracks' : 'Pekka'} inputs replay exactly under version ${version}`, () => {
      const r = attackingPekkaRecording(version, 11.4, 1, siege),
        model = new GameModel();
      expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        model.seekReplay(snapshot.at);
        while (model.replay!.seeking) model.step(0.05);
        expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
      }
    });
it('carried Pekka and Siege Barracks both enable the source release clock', () => {
  const s = structuredClone(attackingPekkaBattle().data.initial);
  expect(replayBattle(s).nativePekkaWindup).toBe(true);
  expect(replayBattle(s, 163).nativePekkaWindup).toBeUndefined();
  s.army.pekka = 0;
  expect(replayBattle(s).nativePekkaWindup).toBeUndefined();
  s.army.siegebarracks = 1;
  expect(replayBattle(s).nativePekkaWindup).toBe(true);
});

for (const interrupt of [false, true])
  it(`Pekka prepares a blocking-wall swing, defender interrupts=${interrupt}`, () => {
    const r = attackingPekkaBattle();
    for (let y = 0; y < 48; y++) r.battle.buildings.push(makeBuilding(1000 + y, 'wall', 12, y, 15));
    const guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 17.4, 11.5, 0);
    guard.alerted = true;
    guard.stunnedUntil = 100;
    while (!r.unit.attacking) r.step();
    const wall = r.battle.buildings.find((b) => b.id === r.unit.native!.attackWindup!.target!.id)!;
    expect(wall.kind).toBe('wall');
    expect(wall.hp).toBe(wall.maxHp);
    guard.y = 14;
    r.step();
    expect(nativeTroopFacingTarget(r.battle, r.unit)).toEqual({ x: wall.x + 0.5, y: wall.y + 0.5 });
    if (interrupt) {
      guard.x = r.unit.x + 0.1;
      guard.y = r.unit.y;
      r.step();
      expect(r.unit.native!.attackWindup!.target).toEqual({ id: guard.id, building: false });
    }
    r.untilAttacks(1);
    const damage = nativeUnitStats('pekka', 1).damage;
    expect(wall.hp).toBeCloseTo(wall.maxHp - (interrupt ? 0 : damage), 8);
    expect(guard.hp).toBeCloseTo(guard.maxHp - (interrupt ? damage : 0), 8);
    const first = r.battle.elapsed;
    r.untilAttacks(2);
    expect(r.battle.elapsed - first).toBeCloseTo(1.8, 8);
  });
