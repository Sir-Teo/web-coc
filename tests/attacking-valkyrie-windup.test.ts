import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type FX } from '../src/game/model';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { nativeUnitRow, nativeUnitStats } from '../src/game/native-units';
import { splitTiming } from '../src/game/garrison-kinds';
import { nativeTroopFacingTarget } from '../src/game/native-troop-facing';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { attackingValkyrieBattle, attackingValkyrieRecording } from './fixtures/attacking-valkyrie';

for (const superTroop of [false, true]) {
  const kind = superTroop ? 'supervalkyrie' : 'valkyrie',
    firstHit = superTroop ? 0.6 : 0.3,
    period = superTroop ? 1.1 : 1.8;
  for (let level = 1; level <= 12; level++)
    for (const x of [11.4, 6.9])
      it(`${kind} ${level} starts its source swing on engagement from x=${x}`, () => {
        const r = attackingValkyrieBattle(level, undefined, x, superTroop),
          target = r.battle.buildings.find((b) => b.id === 2)!,
          hp = target.hp;
        expect(r.unit.level ?? r.battle.troopLevels?.[kind]).toBe(level);
        expect(splitTiming(nativeUnitRow(kind, level))).toMatchObject({
          firstHit,
          period,
          recovery: superTroop ? 0 : 0.3,
        });
        while (!r.unit.attacking) r.step();
        const engaged = r.battle.elapsed;
        expect(target.hp).toBe(hp);
        r.untilAttacks(1);
        const first = r.battle.elapsed;
        expect(first - engaged + 0.05).toBeCloseTo(firstHit, 8);
        expect(target.hp).toBeCloseTo(hp - nativeUnitStats(kind, level).damage, 8);
        r.untilAttacks(2);
        expect(r.battle.elapsed - first).toBeCloseTo(period, 8);
      });
  for (const level of [1, 12])
    it(`${kind} ${level} sweeps around itself against a defender without double-hitting or reaching air`, () => {
      const r = attackingValkyrieBattle(level, undefined, 11.4, superTroop);
      r.battle.buildings.push(makeBuilding(3, 'wall', 12, 11, 15));
      const primary = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 11.8, 11.5, 0),
        near = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 10.9, 11.5, 0),
        far = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 12.45, 11.5, 0),
        air = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, 11.4, 11.8, 0),
        future = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 11.4, 11.8, 100),
        wall = r.battle.buildings.at(-1)!;
      for (const d of [primary, near, far, air, future]) {
        d.alerted = true;
        d.stunnedUntil = 100;
      }
      const effects: FX[] = [];
      r.model.onEffect = (fx) => effects.push(fx);
      r.untilAttacks(1);
      expect(effects.filter((fx) => fx.nativeValkyrieSweep)).toHaveLength(1);
      expect(effects.find((fx) => fx.nativeValkyrieSweep)?.sourceId).toBe(r.unit.id);
      const damage = nativeUnitStats(kind, level).damage;
      expect(r.unit.x).toBe(11.4);
      expect(r.unit.y).toBe(11.5);
      for (const d of [primary, near]) expect(d.hp).toBeCloseTo(d.maxHp - damage, 8);
      for (const d of [far, air, future]) expect(d.hp).toBe(d.maxHp);
      expect(wall.hp).toBeCloseTo(wall.maxHp - damage, 8);
      expect(r.battle.buildings.find((b) => b.id === 2)!.hp).toBe(
        r.battle.buildings.find((b) => b.id === 2)!.maxHp,
      );
    });
  it(`${kind} retargets with its source initial charge after unspent recovery`, () => {
    const r = attackingValkyrieBattle(1, undefined, 11.4, superTroop);
    r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
    r.untilAttacks(1);
    const first = r.battle.elapsed,
      target = r.battle.buildings.find((b) => b.id === 2)!;
    r.model.damage(target, target.hp);
    r.untilAttacks(2);
    expect(r.unit.target).toBe(3);
    expect(r.battle.elapsed - first).toBeCloseTo(0.6, 8);
  });
  for (const recovery of [false, true])
    it(`${kind} Freeze holds ${recovery ? 'repeat recovery' : 'fresh charge'}`, () => {
      const r = attackingValkyrieBattle(1, undefined, 11.4, superTroop);
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed;
      if (recovery) {
        r.untilAttacks(1);
        r.step();
      }
      const before = r.unit.native!.attacks ?? 0,
        from = recovery ? r.unit.native!.lastAttackAt! : engaged - 0.05;
      (r.unit.native!.effects ??= {}).frozenUntil = r.battle.elapsed + 1;
      r.untilAttacks(before + 1);
      expect(r.battle.elapsed - from).toBeCloseTo((recovery ? period : firstHit) + 1, 8);
    });
  for (const slowed of [false, true])
    it(`${kind} scales both phases, slowed=${slowed}`, () => {
      const r = attackingValkyrieBattle(1, undefined, 11.4, superTroop);
      r.unit.native!.effects = slowed
        ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
        : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed,
        scale = slowed ? 2 : 0.5;
      r.untilAttacks(1);
      const first = r.battle.elapsed;
      expect(first - engaged + 0.05).toBeCloseTo(firstHit * scale, 8);
      r.untilAttacks(2);
      expect(r.battle.elapsed - first).toBeCloseTo(period * scale, 8);
    });
  for (const interrupt of [false, true])
    it(`${kind} holds its blocking wall until the pursued defender enters melee, interrupt=${interrupt}`, () => {
      const r = attackingValkyrieBattle(1, undefined, 11.4, superTroop);
      for (let y = 0; y < 48; y++)
        r.battle.buildings.push(makeBuilding(1000 + y, 'wall', 12, y, 15));
      const guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 17.4, 11.5, 0);
      guard.alerted = true;
      guard.stunnedUntil = 100;
      while (!r.unit.attacking) r.step();
      const wall = r.battle.buildings.find(
        (b) => b.id === r.unit.native!.attackWindup!.target!.id,
      )!;
      expect(wall.kind).toBe('wall');
      expect(wall.hp).toBe(wall.maxHp);
      expect(nativeTroopFacingTarget(r.battle, r.unit)).toEqual({
        x: wall.x + 0.5,
        y: wall.y + 0.5,
      });
      if (interrupt) {
        guard.x = r.unit.x + 0.1;
        guard.y = r.unit.y;
        r.step();
        expect(r.unit.native!.attackWindup!.target).toEqual({ id: guard.id, building: false });
      }
      r.untilAttacks(1);
      const first = r.battle.elapsed;
      expect(guard.hp).toBeCloseTo(
        guard.maxHp - (interrupt ? nativeUnitStats(kind, 1).damage : 0),
        8,
      );
      expect(wall.hp).toBeLessThan(wall.maxHp);
      r.untilAttacks(2);
      expect(r.battle.elapsed - first).toBeCloseTo(period, 8);
    });
  for (const garrison of [false, true])
    for (const version of [164, 165])
      it(`${kind} actual ${garrison ? 'Castle' : 'building'} inputs preserve full portable snapshots in version ${version}`, () => {
        const r = attackingValkyrieRecording(version, 11.4, 12, superTroop, garrison),
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
  it(`${kind} version 164 keeps immediate single-target defender attacks`, () => {
    const r = attackingValkyrieBattle(1, 164, 11.4, superTroop),
      guards = [
        spawnGarrisonDefender(r.battle, 'golem', 8, 1, 11.8, 11.5, 0),
        spawnGarrisonDefender(r.battle, 'golem', 8, 1, 10.9, 11.5, 0),
      ];
    for (const d of guards) {
      d.alerted = true;
      d.stunnedUntil = 100;
    }
    r.step();
    expect(guards[0].hp).toBeLessThan(guards[0].maxHp);
    expect(guards[1].hp).toBe(guards[1].maxHp);
    expect(r.unit.native!.attackWindup).toBeUndefined();
  });
}
it('only carried Valkyrie variants enable the new family boundary', () => {
  const s = structuredClone(attackingValkyrieBattle().data.initial);
  expect(replayBattle(s).nativeValkyrieWindup).toBe(true);
  expect(replayBattle(s, 164).nativeValkyrieWindup).toBeUndefined();
  s.army.valkyrie = 0;
  expect(replayBattle(s).nativeValkyrieWindup).toBeUndefined();
  s.army.supervalkyrie = 1;
  expect(replayBattle(s).nativeValkyrieWindup).toBe(true);
});
