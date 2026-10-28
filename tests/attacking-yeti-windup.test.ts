import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { nativeUnitStats } from '../src/game/native-units';
import { nativeTroopFacingTarget } from '../src/game/native-troop-facing';
import { hurtUnit } from '../src/game/native-status';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import {
  attackingYetiBattle,
  attackingYetiRecording,
  attackingYetiRecallRecording,
} from './fixtures/attacking-yeti';

for (const superTroop of [false, true]) {
  const kind = superTroop ? 'superyeti' : 'yeti';
  for (let level = 1; level <= 8; level++)
    for (const x of [11.4, 6.9])
      it(`${kind} ${level} starts a fresh claw after approaching from x=${x}`, () => {
        const r = attackingYetiBattle(level, undefined, x, superTroop),
          target = r.battle.buildings.find((b) => b.id === 2)!,
          hp = target.hp;
        expect(r.battle.troopLevels![kind]).toBe(level);
        while (!r.unit.attacking) r.step();
        const engaged = r.battle.elapsed;
        expect(target.hp).toBe(hp);
        r.untilAttacks(1);
        const first = r.battle.elapsed;
        expect(first - engaged + 0.05).toBeCloseTo(1, 8);
        expect(target.hp).toBeCloseTo(hp - nativeUnitStats(kind, level).damage, 8);
        r.untilAttacks(2);
        expect(r.battle.elapsed - first).toBeCloseTo(1, 8);
      });

  it(`${kind} Freeze and stun hold the claw through both cycles`, () => {
    const r = attackingYetiBattle(1, undefined, 11.4, superTroop);
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed;
    r.unit.native!.effects = { frozenUntil: engaged + 1 };
    r.untilAttacks(1);
    expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(2, 8);
    const first = r.battle.elapsed;
    r.step();
    r.unit.native!.effects.stunUntil = r.battle.elapsed + 1;
    r.untilAttacks(2);
    expect(r.battle.elapsed - first).toBeCloseTo(2, 8);
  });
  for (const slowed of [false, true])
    it(`${kind} scales claw time, slowed=${slowed}`, () => {
      const r = attackingYetiBattle(1, undefined, 11.4, superTroop);
      r.unit.native!.effects = slowed
        ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
        : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed,
        scale = slowed ? 2 : 0.5;
      r.untilAttacks(1);
      const first = r.battle.elapsed;
      expect(first - engaged + 0.05).toBeCloseTo(scale, 8);
      r.untilAttacks(2);
      expect(r.battle.elapsed - first).toBeCloseTo(scale, 8);
    });
  it(`${kind} starts a fresh windup when its building target is destroyed`, () => {
    const r = attackingYetiBattle(1, undefined, 11.4, superTroop);
    r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
    r.untilAttacks(1);
    const first = r.battle.elapsed,
      target = r.battle.buildings.find((b) => b.id === 2)!;
    r.model.damage(target, target.hp);
    r.untilAttacks(2);
    expect(r.unit.target).toBe(3);
    expect(r.battle.elapsed - first).toBeCloseTo(1, 8);
  });
  it(`${kind} retaliates against a ground defender and never claws air`, () => {
    const r = attackingYetiBattle(1, undefined, 11.4, superTroop),
      guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 11.8, 11.5, 0),
      air = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, 11.4, 11.6, 0);
    for (const d of [guard, air]) {
      d.alerted = true;
      d.stunnedUntil = 100;
    }
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed;
    expect(guard.hp).toBe(guard.maxHp);
    r.untilAttacks(1);
    expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1, 8);
    expect(guard.hp).toBeCloseTo(guard.maxHp - nativeUnitStats(kind, 1).damage, 8);
    expect(air.hp).toBe(air.maxHp);
    expect(r.battle.projectiles).toHaveLength(0);
  });
  it(`${kind} faces and winds up against a wall blocking defender pursuit`, () => {
    const r = attackingYetiBattle(1, undefined, 11.4, superTroop);
    for (let y = 0; y < 48; y++) r.battle.buildings.push(makeBuilding(1000 + y, 'wall', 12, y, 15));
    const guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 17.4, 11.5, 0);
    guard.alerted = true;
    guard.stunnedUntil = 100;
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed,
      wall = r.battle.buildings.find((b) => b.id === r.unit.native!.attackWindup!.target!.id)!;
    expect(wall.kind).toBe('wall');
    expect(wall.hp).toBe(wall.maxHp);
    guard.y = 14;
    r.step();
    expect(nativeTroopFacingTarget(r.battle, r.unit)).toEqual({ x: wall.x + 0.5, y: wall.y + 0.5 });
    r.untilAttacks(1);
    expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1, 8);
    expect(wall.hp).toBeCloseTo(wall.maxHp - nativeUnitStats(kind, 1).damage, 8);
    expect(guard.hp).toBe(guard.maxHp);
  });
  for (const level of [1, 8]) {
    it(`${kind} ${level} dies during its first charge without a leaked claw or extra mites`, () => {
      const r = attackingYetiBattle(level, undefined, 11.4, superTroop),
        cap = level === 8 ? 14 : superTroop ? 7 : 8;
      while (!r.unit.attacking) r.step();
      hurtUnit(r.battle, r.unit, r.unit.maxHp);
      r.step();
      expect(r.unit.native!.attacks ?? 0).toBe(0);
      expect(r.unit.native!.damageSpawns).toBe(cap);
      expect(
        r.battle.units.filter((u) => u.kind === (superTroop ? 'electromite' : 'yetimite')),
      ).toHaveLength(cap);
    });
    for (const version of [174, 175]) {
      for (const garrison of [false, true])
        it(`${kind} ${level} ${garrison ? 'guard' : 'Cannon'} fight replays version ${version}`, () => {
          const r = attackingYetiRecording(version, level, superTroop, garrison),
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
      it(`${kind} ${level} Recall keeps finite stock and gives the new body its own version-${version} claw`, () => {
        const r = attackingYetiRecallRecording(superTroop, level, version),
          model = new GameModel();
        expect(r.restored).toEqual({ damage: r.damage, released: r.released });
        expect(r.id).not.toBe(r.oldId);
        if (version >= 175) {
          expect(r.first - r.fresh + 0.05).toBeCloseTo(1, 8);
          const recalled = r.snapshots.find((s) => s.at === r.recalled)!.battle;
          expect(recalled.units.some((u) => u.id === r.oldId)).toBe(false);
          expect(r.oldAttacks).toBe(0);
        }
        expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(
          true,
        );
        for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          model.seekReplay(s.at);
          while (model.replay!.seeking) model.step(0.05);
          expect(JSON.parse(JSON.stringify(model.battle))).toEqual(s.battle);
        }
      });
    }
  }
}

it('only carried Yeti family armies enable the new claw clock', () => {
  const s = structuredClone(attackingYetiBattle().data.initial);
  expect(replayBattle(s).nativeYetiWindup).toBe(true);
  expect(replayBattle(s, 174).nativeYetiWindup).toBeUndefined();
  s.army.yeti = 0;
  expect(replayBattle(s).nativeYetiWindup).toBeUndefined();
  s.army.superyeti = 1;
  expect(replayBattle(s).nativeYetiWindup).toBe(true);
});
