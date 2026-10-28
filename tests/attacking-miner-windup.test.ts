import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { nativeUnitStats } from '../src/game/native-units';
import { hurtUnit, unitTriggersTraps } from '../src/game/native-status';
import { targetableUnit } from '../src/game/native-troops';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { attackingMinerBattle, attackingMinerRecording } from './fixtures/attacking-miner';

for (let level = 1; level <= 12; level++)
  for (const x of [11.4, 6.9])
    it(`Miner ${level} surfaces for a 1.5 s windup after approaching from x=${x}`, () => {
      const r = attackingMinerBattle(level, undefined, x),
        target = r.battle.buildings.find((b) => b.id === 2)!,
        hp = target.hp;
      expect(r.unit.native!.burrowed).toBe(true);
      expect(targetableUnit(r.battle, r.unit)).toBe(false);
      expect(unitTriggersTraps(r.unit)).toBe(false);
      expect(hurtUnit(r.battle, r.unit, 1)).toBe(0);
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed;
      expect(r.unit.native).toMatchObject({ surfaced: true, burrowed: false });
      expect(targetableUnit(r.battle, r.unit)).toBe(true);
      expect(unitTriggersTraps(r.unit)).toBe(true);
      expect(target.hp).toBe(hp);
      expect(hurtUnit(r.battle, r.unit, 1)).toBe(1);
      r.untilAttacks(1);
      const first = r.battle.elapsed;
      expect(first - engaged + 0.05).toBeCloseTo(1.5, 8);
      expect(target.hp).toBeCloseTo(hp - nativeUnitStats('miner', level).damage, 8);
      expect(r.unit.native!.attackWindup!.recovery).toBeCloseTo(0.2, 8);
      r.untilAttacks(2);
      expect(r.battle.elapsed - first).toBeCloseTo(1.7, 8);
    });

it('Freeze and stun hold the surfaced windup and recovery', () => {
  const r = attackingMinerBattle();
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed;
  r.unit.native!.effects = { frozenUntil: engaged + 1 };
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(2.5, 8);
  const first = r.battle.elapsed;
  r.step();
  r.unit.native!.effects.stunUntil = r.battle.elapsed + 1;
  r.untilAttacks(2);
  expect(r.battle.elapsed - first).toBeCloseTo(2.7, 8);
  expect(r.unit.native!.burrowed).toBe(false);
});
for (const slowed of [false, true])
  it(`Miner action phases scale, slowed=${slowed}`, () => {
    const r = attackingMinerBattle();
    r.unit.native!.effects = slowed
      ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
      : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed,
      scale = slowed ? 2 : 0.5;
    r.untilAttacks(1);
    const first = r.battle.elapsed;
    expect(first - engaged + 0.05).toBeCloseTo(1.5 * scale, 8);
    r.untilAttacks(2);
    expect(r.battle.elapsed - first).toBeCloseTo(1.7 * scale, 8);
  });

it('Miner tunnels under a full wall line and surfaces before charging the building', () => {
  const r = attackingMinerBattle();
  const walls = Array.from({ length: 48 }, (_, y) => makeBuilding(1000 + y, 'wall', 12, y, 15));
  r.battle.buildings.push(...walls);
  while (!r.unit.attacking) {
    expect(r.unit.native!.burrowed).toBe(true);
    r.step();
  }
  expect(r.unit.x).toBeGreaterThan(12);
  expect(r.unit.native).toMatchObject({ surfaced: true, burrowed: false });
  r.untilAttacks(1);
  expect(walls.every((w) => w.hp === w.maxHp)).toBe(true);
});
it('a frozen underground Miner stays hidden and starts a full windup after thawing', () => {
  const r = attackingMinerBattle();
  r.unit.native!.effects = { frozenUntil: 1 };
  r.until(0.8);
  expect(r.unit.native!.burrowed).toBe(true);
  expect(targetableUnit(r.battle, r.unit)).toBe(false);
  expect(r.unit.native!.attackWindup).toBeUndefined();
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed;
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1.5, 8);
});
it('an adjacent replacement target consumes the remaining recovery only once', () => {
  const r = attackingMinerBattle();
  r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
  r.untilAttacks(1);
  const first = r.battle.elapsed,
    target = r.battle.buildings.find((b) => b.id === 2)!;
  r.model.damage(target, target.hp);
  r.untilAttacks(2);
  expect(r.unit.target).toBe(3);
  expect(r.battle.elapsed - first).toBeCloseTo(1.7, 8);
});
it('Miner surfaces for a ground defender windup, can be damaged, and never hits air', () => {
  const r = attackingMinerBattle(),
    guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 11.8, 11.5, 0),
    air = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, 11.4, 11.6, 0);
  for (const d of [guard, air]) {
    d.alerted = true;
    d.stunnedUntil = 100;
  }
  r.step();
  const engaged = r.battle.elapsed;
  expect(r.unit.native).toMatchObject({ surfaced: true, burrowed: false });
  expect(guard.hp).toBe(guard.maxHp);
  expect(hurtUnit(r.battle, r.unit, 10)).toBe(10);
  expect(unitTriggersTraps(r.unit)).toBe(true);
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1.5, 8);
  expect(guard.hp).toBeCloseTo(guard.maxHp - nativeUnitStats('miner', 1).damage, 8);
  expect(air.hp).toBe(air.maxHp);
});
it('Miner reburrows to a distant building and starts a fresh charge on emergence', () => {
  const r = attackingMinerBattle();
  r.untilAttacks(1);
  const old = r.battle.buildings.find((b) => b.id === 2)!;
  r.model.damage(old, old.hp);
  r.step();
  expect(r.unit.native).toMatchObject({ surfaced: false, burrowed: true });
  expect(targetableUnit(r.battle, r.unit)).toBe(false);
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed;
  expect(r.unit.native!.burrowed).toBe(false);
  r.untilAttacks(2);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1.5, 8);
});
it('a fleeing defender cancels the old charge before the Miner reburrows', () => {
  const r = attackingMinerBattle(),
    guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 11.8, 11.5, 0);
  guard.alerted = true;
  guard.stunnedUntil = 100;
  r.step();
  r.until(r.battle.elapsed + 0.5);
  guard.x = 30;
  r.step();
  expect(r.unit.native).toMatchObject({ surfaced: false, burrowed: true });
  expect(r.unit.native!.attackWindup!.engaged).toBeUndefined();
  r.until(r.battle.elapsed + 1.7);
  expect(guard.hp).toBe(guard.maxHp);
  expect(r.unit.native!.burrowed).toBe(true);
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed;
  expect(r.unit.native!.burrowed).toBe(false);
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1.5, 8);
  expect(guard.hp).toBeCloseTo(guard.maxHp - nativeUnitStats('miner', 1).damage, 8);
});

for (const level of [1, 12])
  for (const version of [177, 178])
    for (const garrison of [false, true])
      it(`Miner ${level} actual ${garrison ? 'Castle' : 'Cannon'} fight reproduces version ${version}`, () => {
        const r = attackingMinerRecording(version, level, garrison),
          model = new GameModel();
        expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(
          true,
        );
        for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          model.seekReplay(s.at);
          while (model.replay!.seeking) model.step(0.05);
          expect(JSON.parse(JSON.stringify(model.battle))).toEqual(s.battle);
        }
      });

it('only carried ordinary Miners enable the melee phases', () => {
  const s = structuredClone(attackingMinerBattle().data.initial);
  expect(replayBattle(s).nativeMinerWindup).toBe(true);
  expect(replayBattle(s, 177).nativeMinerWindup).toBeUndefined();
  s.army.miner = 0;
  s.army.superminer = 1;
  expect(replayBattle(s).nativeMinerWindup).toBeUndefined();
});
