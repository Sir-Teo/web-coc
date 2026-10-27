import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { replayBattle } from '../src/game/replay';
import { attackingBowlerBattle, attackingBowlerRecording } from './fixtures/attacking-bowler';

for (let level = 1; level <= 10; level++)
  for (const x of [11.4, 6.9])
    it(`Bowler ${level} charges after reaching range from x=${x}`, () => {
      const r = attackingBowlerBattle(level, undefined, x);
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed;
      r.untilAttacks(1);
      const first = r.battle.elapsed;
      expect(first - engaged + 0.05).toBeCloseTo(0.4, 8);
      r.untilAttacks(2);
      expect(r.battle.elapsed - first).toBeCloseTo(2.2, 8);
    });

it('full Freeze holds both Bowler windup and post-hit recovery', () => {
  const r = attackingBowlerBattle();
  r.step();
  r.unit.native!.effects = { frozenUntil: r.battle.elapsed + 2 };
  r.untilAttacks(1);
  expect(r.battle.elapsed).toBeCloseTo(2.4, 8);
  const first = r.battle.elapsed;
  r.step();
  r.unit.native!.effects.frozenUntil = r.battle.elapsed + 2;
  r.untilAttacks(2);
  expect(r.battle.elapsed - first).toBeCloseTo(4.2, 8);
});

it('a fresh target during recovery waits 0.7s recovery plus the 0.4s initial charge', () => {
  const r = attackingBowlerBattle();
  r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 14, 18));
  r.untilAttacks(1);
  const first = r.battle.elapsed;
  const target = r.battle.buildings.find((b) => b.id === 2)!;
  r.model.damage(target, target.hp);
  r.untilAttacks(2);
  expect(r.battle.elapsed - first).toBeCloseTo(1.1, 8);
  expect(r.unit.target).toBe(3);
});

it('defender-targeted windup retains the established release path and hits exactly once', () => {
  const r = attackingBowlerBattle();
  r.battle.buildings = r.battle.buildings.filter((b) => b.id === 1);
  const target = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 13, 11.5, 0);
  target.alerted = true;
  r.untilAttacks(1);
  expect(r.battle.elapsed).toBeCloseTo(0.4, 8);
  const shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
  expect(shot).toMatchObject({ weapon: 'arrow', targetDefender: true, targetId: target.id });
  r.until(shot.impact + 0.05);
  expect(target.hp).toBeCloseTo(target.maxHp - shot.damage, 8);
});

it('a committed defender windup keeps the ground route and finishes while chasing', () => {
  const r = attackingBowlerBattle();
  r.battle.buildings = r.battle.buildings.filter((b) => b.id === 1);
  const target = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 13, 11.5, 0);
  target.alerted = true;
  r.step();
  target.x = 20;
  r.untilAttacks(1);
  expect(r.battle.elapsed).toBeCloseTo(0.4, 8);
  expect(r.unit.x).toBeGreaterThan(11.4);
});

for (const level of [1, 10])
  for (const slowed of [false, true])
    it(`Bowler ${level} scales both phases on the active attack clock, slowed=${slowed}`, () => {
      const r = attackingBowlerBattle(level);
      r.unit.native!.effects = slowed
        ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
        : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
      const scale = slowed ? 2 : 0.5;
      r.untilAttacks(1);
      expect(r.battle.elapsed).toBeCloseTo(0.4 * scale, 8);
      const first = r.battle.elapsed;
      r.untilAttacks(2);
      expect(r.battle.elapsed - first).toBeCloseTo(2.2 * scale, 8);
    });

for (const x of [11.4, 6.9]) {
  it(`version 155 retains the acquisition-time delay from x=${x}`, () => {
    const r = attackingBowlerBattle(1, 155, x);
    r.untilAttacks(1);
    expect(r.battle.elapsed).toBeCloseTo(x === 11.4 ? 1.15 : 1.85, 8);
  });
  for (const version of [155, 156])
    it(`actual Bowler inputs reproduce full version-${version} snapshots from x=${x}`, () => {
      const r = attackingBowlerRecording(version, x),
        model = new GameModel();
      expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        model.seekReplay(snapshot.at);
        while (model.replay!.seeking) model.step(0.05);
        expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
      }
    });
}

it('only carried Bowler armies enable the windup controller', () => {
  const s = structuredClone(attackingBowlerBattle().data.initial);
  expect(replayBattle(s).nativeBowlerWindup).toBe(true);
  expect(replayBattle(s, 155).nativeBowlerWindup).toBeUndefined();
  s.army.bowler = 0;
  expect(replayBattle(s).nativeBowlerWindup).toBeUndefined();
});
