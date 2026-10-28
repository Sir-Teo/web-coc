import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { nativeUnitStats } from '../src/game/native-units';
import { defenderFrostScales } from '../src/game/defender-frost';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { replayBattle } from '../src/game/replay';
import {
  attackingIceGolemBattle,
  attackingIceGolemRecording,
} from './fixtures/attacking-ice-golem';

for (let level = 1; level <= 9; level++) {
  for (const x of [11.4, 6.9])
    it(`Ice Golem ${level} starts its first melee swing after approaching from x=${x}`, () => {
      const r = attackingIceGolemBattle(level, undefined, x),
        target = r.battle.buildings.find((b) => b.id === 2)!,
        hp = target.hp;
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed;
      expect(target.hp).toBe(hp);
      expect(r.battle.buildingEffects?.[2]?.frost).toBeUndefined();
      r.untilAttacks(1);
      const first = r.battle.elapsed;
      expect(first - engaged + 0.05).toBeCloseTo(1.5, 8);
      expect(target.hp).toBeCloseTo(hp - nativeUnitStats('icegolem', level).damage, 8);
      expect(r.battle.buildingEffects?.[2]?.frost).toEqual({ until: first + 2, percent: 0.5 });
      r.untilAttacks(2);
      expect(r.battle.elapsed - first).toBeCloseTo(2, 8);
    });

  it(`Ice Golem ${level} chills the ground defender it actually punches`, () => {
    const r = attackingIceGolemBattle(level),
      guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 12.2, 11.5, 0),
      air = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, 11.4, 11.6, 0);
    for (const d of [guard, air]) {
      d.alerted = true;
      d.stunnedUntil = 100;
    }
    while (!r.unit.attacking) r.step();
    expect(guard.frost).toBeUndefined();
    r.untilAttacks(1);
    const first = r.battle.elapsed;
    expect(guard.hp).toBeCloseTo(guard.maxHp - nativeUnitStats('icegolem', level).damage, 8);
    expect(guard.frost).toEqual({ until: first + 2, percent: 0.5 });
    expect(defenderFrostScales(guard, first + 2 - 1e-6)).toEqual({ move: 0.5, attack: 0.5 });
    expect(defenderFrostScales(guard, first + 2)).toEqual({ move: 1, attack: 1 });
    expect(air.hp).toBe(air.maxHp);
    expect(air.frost).toBeUndefined();
    expect(r.battle.projectiles).toHaveLength(0);
    r.untilAttacks(2);
    expect(guard.frost!.until).toBeCloseTo(first + 4, 8);
  });
}

it('Ice Golem Freeze and stun hold both attack phases', () => {
  const r = attackingIceGolemBattle();
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed;
  r.unit.native!.effects = { frozenUntil: engaged + 1 };
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(2.5, 8);
  const first = r.battle.elapsed;
  r.step();
  r.unit.native!.effects.stunUntil = r.battle.elapsed + 1;
  r.untilAttacks(2);
  expect(r.battle.elapsed - first).toBeCloseTo(3, 8);
});
it('Ice Golem retargeting spends remaining recovery once', () => {
  const r = attackingIceGolemBattle();
  r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
  r.untilAttacks(1);
  const first = r.battle.elapsed,
    target = r.battle.buildings.find((b) => b.id === 2)!;
  r.model.damage(target, target.hp);
  r.untilAttacks(2);
  expect(r.unit.target).toBe(3);
  expect(r.battle.elapsed - first).toBeCloseTo(2, 8);
});
it('a preferred Cannon keeps Ice Golem from retaliating against a nearby guard', () => {
  const r = attackingIceGolemBattle(1, undefined, 11.4, 'cannon'),
    guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 12.2, 11.5, 0);
  guard.alerted = true;
  guard.stunnedUntil = 100;
  r.untilAttacks(1);
  expect(r.unit.target).toBe(2);
  expect(guard.hp).toBe(guard.maxHp);
  expect(guard.frost).toBeUndefined();
});

for (const version of [171, 172])
  for (const level of [1, 9])
    for (const garrison of [false, true])
      it(`Ice Golem ${level} against ${garrison ? 'a lured reserve' : 'a Cannon'} replays version ${version} exactly`, () => {
        const r = attackingIceGolemRecording(version, level, garrison),
          model = new GameModel();
        expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(
          true,
        );
        for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          model.seekReplay(s.at);
          while (model.replay!.seeking) model.step(0.05);
          expect(JSON.parse(JSON.stringify(model.battle))).toEqual(s.battle);
        }
        if (garrison) {
          const battle = r.snapshots.find((s) => s.at === r.first)!.battle,
            guard = battle.defenders!.find((d) => d.id === r.defenderId)!;
          if (version >= 172) expect(guard.frost).toEqual({ until: r.first + 2, percent: 0.5 });
          else expect(guard.frost).toBeUndefined();
        }
      });

it('only carried Ice Golem armies enable the new rules', () => {
  const s = structuredClone(attackingIceGolemBattle().data.initial);
  expect(replayBattle(s).nativeIceGolemWindup).toBe(true);
  expect(replayBattle(s, 171).nativeIceGolemWindup).toBeUndefined();
  s.army.icegolem = 0;
  expect(replayBattle(s).nativeIceGolemWindup).toBeUndefined();
});
