import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { replayBattle } from '../src/game/replay';
import { nativeTroopFacingTarget } from '../src/game/native-troop-facing';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { nativeUnitLevels, nativeUnitRow, nativeUnitStats } from '../src/game/native-units';
import { splitTiming } from '../src/game/garrison-kinds';
import { attackingGiantBattle, attackingGiantRecording } from './fixtures/attacking-giant';

for (const superTroop of [false, true]) {
  const kind = superTroop ? 'supergiant' : 'giant';
  for (let level = 1; level <= nativeUnitLevels(kind); level++)
    for (const x of [11.4, 6.9])
      it(`${kind} ${level} winds up after its approach from x=${x}`, () => {
        const r = attackingGiantBattle(level, undefined, x, superTroop),
          target = r.battle.buildings.find((b) => b.id === 2)!,
          hp = target.hp;
        expect(r.unit.level ?? r.battle.troopLevels?.[kind]).toBe(level);
        expect(splitTiming(nativeUnitRow(kind, level))).toEqual({
          period: 2,
          recovery: 0.5,
          windup: 1.5,
          charge: 0,
          firstHit: 1.5,
        });
        while (!r.unit.attacking) r.step();
        const engaged = r.battle.elapsed;
        expect(target.hp).toBe(hp);
        r.untilAttacks(1);
        const first = r.battle.elapsed;
        expect(first - engaged + 0.05).toBeCloseTo(1.5, 8);
        expect(target.hp).toBeCloseTo(hp - nativeUnitStats(kind, level).damage, 8);
        r.untilAttacks(2);
        expect(r.battle.elapsed - first).toBeCloseTo(2, 8);
      });

  it(`${kind} freezes both windup and recovery without banking attack time`, () => {
    const r = attackingGiantBattle(1, undefined, 11.4, superTroop);
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed;
    r.unit.native!.effects = { frozenUntil: engaged + 1 };
    r.untilAttacks(1);
    expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(2.5, 8);
    const first = r.battle.elapsed;
    r.step();
    r.unit.native!.effects.frozenUntil = r.battle.elapsed + 1;
    r.untilAttacks(2);
    expect(r.battle.elapsed - first).toBeCloseTo(3, 8);
  });

  for (const slowed of [false, true])
    it(`${kind} scales both attack phases, slowed=${slowed}`, () => {
      const r = attackingGiantBattle(1, undefined, 11.4, superTroop);
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
      expect(r.battle.elapsed - first).toBeCloseTo(2 * scale, 8);
    });

  it(`${kind} spends remaining recovery once when its target dies`, () => {
    const r = attackingGiantBattle(1, undefined, 11.4, superTroop);
    r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
    r.untilAttacks(1);
    const first = r.battle.elapsed,
      target = r.battle.buildings.find((b) => b.id === 2)!;
    r.model.damage(target, target.hp);
    r.untilAttacks(2);
    expect(r.unit.target).toBe(3);
    expect(r.battle.elapsed - first).toBeCloseTo(2, 8);
  });

  it(`${kind} keeps its defense preference while an alerted defender is nearby`, () => {
    const r = attackingGiantBattle(1, undefined, 11.4, superTroop, true),
      guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 12.2, 11.5, 0);
    guard.alerted = true;
    guard.stunnedUntil = 100;
    r.untilAttacks(1);
    expect(r.unit.target).toBe(2);
    expect(r.unit.defenderTarget).toBeUndefined();
    expect(guard.hp).toBe(guard.maxHp);
  });

  it(`${kind} uses a direct ground hit after its defender windup`, () => {
    const r = attackingGiantBattle(1, undefined, 11.4, superTroop),
      guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 12.2, 11.5, 0),
      air = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, 11.4, 11.6, 0);
    for (const d of [guard, air]) {
      d.alerted = true;
      d.stunnedUntil = 100;
    }
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed;
    expect(guard.hp).toBe(guard.maxHp);
    r.untilAttacks(1);
    expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1.5, 8);
    expect(guard.hp).toBeCloseTo(guard.maxHp - nativeUnitStats(kind, 1).damage, 8);
    expect(air.hp).toBe(air.maxHp);
    expect(r.battle.projectiles).toHaveLength(0);
  });

  it(`${kind} winds up against a wall and keeps facing it during defender pursuit`, () => {
    const r = attackingGiantBattle(1, undefined, 11.4, superTroop);
    for (let y = 0; y < 48; y++) r.battle.buildings.push(makeBuilding(1000 + y, 'wall', 12, y, 15));
    const guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 17.4, 11.5, 0);
    guard.alerted = true;
    guard.stunnedUntil = 100;
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed,
      ref = r.unit.native!.attackWindup!.target!,
      wall = r.battle.buildings.find((b) => b.id === ref.id)!;
    expect(ref.building).toBe(true);
    expect(wall.kind).toBe('wall');
    expect(wall.hp).toBe(wall.maxHp);
    guard.y = 14;
    r.step();
    expect(nativeTroopFacingTarget(r.battle, r.unit)).toEqual({ x: wall.x + 0.5, y: wall.y + 0.5 });
    r.untilAttacks(1);
    expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1.5, 8);
    const stats = nativeUnitStats(kind, 1);
    expect(wall.hp).toBeCloseTo(
      wall.maxHp - stats.damage * (superTroop ? stats.damageMultiplier : 1),
      8,
    );
    expect(guard.hp).toBe(guard.maxHp);
  });

  it(`version 170 retains ${kind}'s immediate first hit and prior state`, () => {
    const r = attackingGiantBattle(1, 170, 11.4, superTroop),
      target = r.battle.buildings.find((b) => b.id === 2)!;
    while (!r.unit.attacking) r.step();
    expect(target.hp).toBeLessThan(target.maxHp);
    expect(r.unit.native?.attackWindup).toBeUndefined();
  });

  for (const version of [170, 171])
    for (const far of [false, true])
      it(`${kind} actual deployment replays all version-${version} snapshots, far=${far}`, () => {
        const r = attackingGiantRecording(
            version,
            far ? 6.9 : 11.4,
            far ? nativeUnitLevels(kind) : 1,
            superTroop,
          ),
          model = new GameModel();
        expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(
          true,
        );
        for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          model.seekReplay(snapshot.at);
          while (model.replay!.seeking) model.step(0.05);
          expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
        }
      });
}

it('only carried Giant family armies enable the new timing', () => {
  const s = structuredClone(attackingGiantBattle().data.initial);
  expect(replayBattle(s).nativeGiantWindup).toBe(true);
  expect(replayBattle(s, 170).nativeGiantWindup).toBeUndefined();
  s.army.giant = 0;
  expect(replayBattle(s).nativeGiantWindup).toBeUndefined();
  s.army.supergiant = 1;
  expect(replayBattle(s).nativeGiantWindup).toBe(true);
});
