import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type FX } from '../src/game/model';
import { nativeUnitRow, nativeUnitStats } from '../src/game/native-units';
import {
  stepNativeUnit,
  resolveNativeImpact,
  type NativeTroopContext,
} from '../src/game/native-troops';
import { stepProjectiles } from '../src/game/projectiles';
import { splitTiming } from '../src/game/garrison-kinds';
import { buildingEffects } from '../src/game/native-status';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { attackingHoundBattle, attackingHoundRecording } from './fixtures/attacking-hound';

for (const ice of [false, true]) {
  const kind = ice ? 'icehound' : 'lavahound';
  for (let level = 1; level <= 8; level++)
    for (const x of [11.4, 6.9])
      it(`${kind} ${level} starts full source windup at x=${x}`, () => {
        const r = attackingHoundBattle(level, undefined, x, ice),
          stats = nativeUnitStats(kind, level),
          target = r.battle.buildings.find((b) => b.id === 2)!,
          hp = target.hp;
        expect(splitTiming(nativeUnitRow(kind, level))).toMatchObject({
          firstHit: 1.5,
          recovery: 0.5,
          period: 2,
        });
        while (!r.unit.attacking) r.step();
        const engaged = r.battle.elapsed;
        expect(target.hp).toBe(hp);
        r.untilAttacks(1);
        const first = r.battle.elapsed;
        expect(first - engaged + 0.05).toBeCloseTo(1.5, 8);
        if (ice) {
          expect(target.hp).toBeCloseTo(hp - stats.damage, 8);
          expect(buildingEffects(r.battle, target).frost).toEqual({
            until: first + 2,
            percent: 0.5,
          });
        } else {
          const shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
          expect(shot).toMatchObject({
            weapon: 'native',
            fromAir: true,
            targetBuilding: true,
            damage: stats.damage,
            native: { name: 'hound_projectile', kind, level },
          });
          expect(target.hp).toBe(hp);
          expect(shot.impact - shot.launched).toBeCloseTo(
            Math.sqrt((shot.x - shot.fromX) ** 2 + (shot.y - shot.fromY) ** 2) / 2,
            8,
          );
          while (r.battle.projectiles!.some((p) => p.id === shot.id)) r.step();
          expect(target.hp).toBeCloseTo(hp - stats.damage, 8);
        }
        r.untilAttacks(2);
        expect(r.battle.elapsed - first).toBeCloseTo(2, 8);
      });
  for (let level = 1; level <= 8; level++)
    it(`${kind} ${level} preserves complete death-release child states`, () => {
      const old = attackingHoundBattle(level, 168, 11.4, ice),
        current = attackingHoundBattle(level, undefined, 11.4, ice);
      for (const r of [old, current]) {
        r.until(0.1);
        r.unit.hp = 0;
        r.step();
      }
      const children = (r) => r.battle.units.filter((u) => u.native?.owner === r.unit.id);
      expect(children(current)).toHaveLength(nativeUnitStats(kind, level).secondaryCount);
      expect(JSON.parse(JSON.stringify(children(current)))).toEqual(
        JSON.parse(JSON.stringify(children(old))),
      );
    });
  for (const recovery of [false, true])
    it(`${kind} Freeze holds ${recovery ? 'recovery' : 'fresh windup'}`, () => {
      const r = attackingHoundBattle(1, undefined, 11.4, ice);
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed;
      if (recovery) {
        r.untilAttacks(1);
        r.step();
      }
      const count = r.unit.native!.attacks ?? 0,
        from = recovery ? r.unit.native!.lastAttackAt! : engaged - 0.05;
      (r.unit.native!.effects ??= {}).frozenUntil = r.battle.elapsed + 1;
      r.untilAttacks(count + 1);
      expect(r.battle.elapsed - from).toBeCloseTo((recovery ? 2 : 1.5) + 1, 8);
    });
  for (const slowed of [false, true])
    it(`${kind} scales windup and recovery, slowed=${slowed}`, () => {
      const r = attackingHoundBattle(1, undefined, 11.4, ice);
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
      expect(r.battle.elapsed - first).toBeCloseTo(2 * scale, 8);
    });
  it(`${kind} preserves remaining recovery across a building retarget`, () => {
    const r = attackingHoundBattle(1, undefined, 11.4, ice);
    r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
    r.untilAttacks(1);
    const first = r.battle.elapsed,
      target = r.battle.buildings.find((b) => b.id === 2)!;
    r.model.damage(target, target.hp);
    r.untilAttacks(2);
    expect(r.unit.target).toBe(3);
    expect(r.battle.elapsed - first).toBeCloseTo(2, 8);
  });
  it(`${kind} keeps its building preference while a defender is alerted`, () => {
    const r = attackingHoundBattle(1, undefined, 11.4, ice);
    while (!r.unit.attacking) r.step();
    const guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, r.unit.x + 0.1, r.unit.y, 0);
    guard.alerted = true;
    guard.stunnedUntil = 100;
    r.untilAttacks(1);
    expect(r.unit.defenderTarget).toBeUndefined();
    expect(guard.hp).toBe(guard.maxHp);
  });
  it(`${kind} keeps its source ground-only attack when no building is eligible`, () => {
    const r = attackingHoundBattle(1, undefined, 11.4, ice),
      stats = nativeUnitStats(kind, 1),
      effects: FX[] = [];
    r.battle.buildings = [];
    const guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, r.unit.x + 0.1, r.unit.y, 0),
      air = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, r.unit.x + 0.05, r.unit.y, 0);
    for (const d of [guard, air]) {
      d.alerted = true;
      d.stunnedUntil = 100;
    }
    const ctx: NativeTroopContext = {
      battle: r.battle,
      buildings: [],
      buildingsById: new Map(),
      passableWalls: new Set(),
      nextId: () => 1000,
      troopLevel: () => 1,
      damageBuilding: () => {},
      effect: (fx) => effects.push(fx),
    };
    for (let i = 0; i < 30; i++) {
      r.battle.elapsed += 0.05;
      r.unit.cooldown -= 0.05;
      r.unit.attacking = false;
      stepNativeUnit(ctx, r.unit, { damage: stats.damage, speed: stats.speed }, 0.05);
    }
    expect(r.unit.native!.attacks).toBe(1);
    expect(air.hp).toBe(air.maxHp);
    if (ice) {
      expect(guard.hp).toBeCloseTo(guard.maxHp - stats.damage, 8);
      expect(guard.frost).toEqual({ until: r.battle.elapsed + 2, percent: 0.5 });
    } else {
      const shot = r.battle.projectiles![0];
      expect(shot).toMatchObject({
        weapon: 'native',
        fromAir: true,
        toAir: false,
        targetDefender: true,
        targetId: guard.id,
        native: { name: 'hound_projectile' },
      });
      expect(guard.hp).toBe(guard.maxHp);
      r.battle.elapsed = shot.impact;
      stepProjectiles(
        r.battle,
        () => {},
        ctx.effect,
        (p) => resolveNativeImpact(ctx, p),
      );
      expect(guard.hp).toBeCloseTo(guard.maxHp - stats.damage, 8);
    }
  });
  for (const version of [168, 169])
    it(`${kind} actual armed Air Defense inputs preserve version-${version} states`, () => {
      const r = attackingHoundRecording(version, 17.6, 8, ice),
        m = new GameModel();
      expect(m.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        m.seekReplay(snapshot.at);
        while (m.replay!.seeking) m.step(0.05);
        expect(JSON.parse(JSON.stringify(m.battle))).toEqual(snapshot.battle);
      }
    });
  it(`${kind} version 168 retains immediate first damage`, () => {
    const r = attackingHoundBattle(1, 168, 11.4, ice),
      target = r.battle.buildings.find((b) => b.id === 2)!,
      hp = target.hp;
    while (!r.unit.attacking) r.step();
    expect(target.hp).toBeCloseTo(hp - nativeUnitStats(kind, 1).damage, 8);
    expect(r.unit.native!.attackWindup).toBeUndefined();
    if (!ice) expect(r.battle.projectiles!.some((p) => p.sourceId === r.unit.id)).toBe(false);
  });
}
it('a Lava Hound projectile resolves after its parent releases its Pups', () => {
  const r = attackingHoundBattle(1, undefined, 11.4),
    effects: FX[] = [];
  r.model.onEffect = (fx) => effects.push(fx);
  r.untilAttacks(1);
  const shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
  r.unit.hp = 0;
  while (r.battle.projectiles!.some((p) => p.id === shot.id)) r.step();
  expect(r.unit.defeatedAt).toBeDefined();
  expect(r.battle.units.filter((u) => u.native?.owner === r.unit.id)).toHaveLength(
    nativeUnitStats('lavahound', 1).secondaryCount,
  );
  expect(effects.filter((fx) => fx.type === 'impact' && fx.projectileId === shot.id)).toHaveLength(
    1,
  );
});
it('only carried parent Hounds allocate their attack boundary', () => {
  const s = structuredClone(attackingHoundBattle().data.initial);
  expect(replayBattle(s).nativeHoundWindup).toBe(true);
  expect(replayBattle(s, 168).nativeHoundWindup).toBeUndefined();
  s.army.lavahound = 0;
  expect(replayBattle(s).nativeHoundWindup).toBeUndefined();
  s.army.icehound = 1;
  expect(replayBattle(s).nativeHoundWindup).toBe(true);
});
