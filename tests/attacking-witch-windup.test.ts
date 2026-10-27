import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { nativeUnitRow, nativeUnitStats } from '../src/game/native-units';
import { splitTiming } from '../src/game/garrison-kinds';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { attackingWitchBattle, attackingWitchRecording } from './fixtures/attacking-witch';

for (const superTroop of [false, true]) {
  const kind = superTroop ? 'superwitch' : 'witch';
  for (let level = 1; level <= 8; level++)
    for (const x of [11.4, 6.9])
      it(`${kind} ${level} spends source windup after engagement at x=${x}`, () => {
        const r = attackingWitchBattle(level, undefined, x, superTroop),
          stats = nativeUnitStats(kind, level);
        expect(splitTiming(nativeUnitRow(kind, level))).toMatchObject({
          firstHit: 0.7,
          period: 0.7,
          recovery: 0,
        });
        while (!r.unit.attacking) r.step();
        const engaged = r.battle.elapsed;
        expect(r.shots).toHaveLength(0);
        r.untilAttacks(1);
        const first = r.shots[0];
        expect(first.at - engaged + 0.05).toBeCloseTo(0.7, 8);
        expect(first.shot).toMatchObject({
          weapon: 'native',
          sourceId: r.unit.id,
          damage: stats.damage,
          splash: 0.3,
          native: { name: 'Witch_projectile', kind, level },
        });
        r.untilAttacks(2);
        expect(r.shots[1].at - first.at).toBeCloseTo(0.7, 8);
      });
  for (const air of [false, true])
    for (const level of [1, 8])
      it(`${kind} ${level} releases its original ${air ? 'air' : 'ground'} projectile after the full charge`, () => {
        const r = attackingWitchBattle(level, undefined, 11.4, superTroop),
          guard = spawnGarrisonDefender(
            r.battle,
            air ? 'dragon' : 'golem',
            air ? 7 : 8,
            1,
            13.4,
            11.5,
            0,
          );
        const near = spawnGarrisonDefender(
            r.battle,
            air ? 'dragon' : 'golem',
            air ? 7 : 8,
            1,
            13.6,
            11.5,
            0,
          ),
          wrong = spawnGarrisonDefender(
            r.battle,
            air ? 'golem' : 'dragon',
            air ? 8 : 7,
            1,
            13.4,
            11.6,
            0,
          ),
          far = spawnGarrisonDefender(
            r.battle,
            air ? 'dragon' : 'golem',
            air ? 7 : 8,
            1,
            13.9,
            11.5,
            0,
          ),
          future = spawnGarrisonDefender(
            r.battle,
            air ? 'dragon' : 'golem',
            air ? 7 : 8,
            1,
            13.5,
            11.5,
            100,
          ),
          building = r.battle.buildings.find((b) => b.id === 2)!,
          hp = building.hp;
        for (const d of [near, wrong, far, future]) {
          d.alerted = true;
          d.stunnedUntil = 100;
        }
        // Isolate caster damage here; portable Castle fixtures retain real summons.
        r.unit.native!.summonAt = 100;
        guard.alerted = true;
        guard.stunnedUntil = 100;
        while (!r.unit.attacking) r.step();
        const engaged = r.battle.elapsed;
        r.untilAttacks(1);
        const shot = r.shots[0].shot;
        expect(shot.launched - engaged + 0.05).toBeCloseTo(0.7, 8);
        expect(shot).toMatchObject({
          weapon: 'native',
          targetId: guard.id,
          targetDefender: true,
          toAir: air,
          native: { name: 'Witch_projectile', kind },
        });
        expect(guard.hp).toBe(guard.maxHp);
        while (r.battle.projectiles?.some((p) => p.id === shot.id)) r.step();
        const damage = nativeUnitStats(kind, level).damage;
        for (const d of [guard, near]) expect(d.hp).toBeCloseTo(d.maxHp - damage, 8);
        for (const d of [wrong, far, future]) expect(d.hp).toBe(d.maxHp);
        expect(building.hp).toBeCloseTo(hp - (air ? 0 : damage), 8);
      });
  for (const air of [false, true])
    for (const version of [165, 166])
      it(`${kind} moving ${air ? 'air' : 'ground'} primary uses version-${version} landing semantics`, () => {
        const r = attackingWitchBattle(1, version, 11.4, superTroop),
          guard = spawnGarrisonDefender(
            r.battle,
            air ? 'dragon' : 'golem',
            air ? 7 : 8,
            1,
            13.4,
            11.5,
            0,
          ),
          nearby = spawnGarrisonDefender(
            r.battle,
            air ? 'dragon' : 'golem',
            air ? 7 : 8,
            1,
            13.6,
            11.5,
            0,
          );
        r.unit.native!.summonAt = 100;
        for (const d of [guard, nearby]) {
          d.alerted = true;
          d.stunnedUntil = 100;
        }
        r.untilAttacks(1);
        const shot = r.shots[0].shot;
        expect(shot.weapon).toBe(version === 166 ? 'native' : 'arrow');
        guard.x += 2;
        r.step();
        const live = r.battle.projectiles!.find((p) => p.id === shot.id)!;
        expect(live.x).toBe(version === 166 ? shot.x : guard.x);
        expect(live.y).toBe(shot.y);
        while (r.battle.projectiles?.some((p) => p.id === shot.id)) r.step();
        const damage = nativeUnitStats(kind, 1).damage;
        expect(guard.hp).toBeCloseTo(guard.maxHp - (version === 166 ? 0 : damage), 8);
        expect(nearby.hp).toBeCloseTo(nearby.maxHp - (version === 166 ? damage : 0), 8);
      });
  it(`${kind} released spell lands once after caster defeat`, () => {
    const r = attackingWitchBattle(1, undefined, 11.4, superTroop),
      guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 13.4, 11.5, 0);
    r.unit.native!.summonAt = 100;
    guard.alerted = true;
    guard.stunnedUntil = 100;
    r.untilAttacks(1);
    const shot = r.shots[0].shot;
    r.unit.hp = 0;
    while (r.battle.projectiles?.some((p) => p.id === shot.id)) r.step();
    expect(guard.hp).toBeCloseTo(guard.maxHp - nativeUnitStats(kind, 1).damage, 8);
  });
  for (const repeat of [false, true])
    it(`${kind} Freeze holds ${repeat ? 'repeat' : 'fresh'} charge`, () => {
      const r = attackingWitchBattle(1, undefined, 11.4, superTroop);
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed;
      if (repeat) {
        r.untilAttacks(1);
        r.step();
      }
      const count = r.shots.length,
        from = repeat ? r.shots[0].at : engaged - 0.05;
      (r.unit.native!.effects ??= {}).frozenUntil = r.battle.elapsed + 1;
      r.untilAttacks(count + 1);
      expect(r.shots.at(-1)!.at - from).toBeCloseTo(1.7, 8);
    });
  for (const slowed of [false, true])
    it(`${kind} scales its whole windup, slowed=${slowed}`, () => {
      const r = attackingWitchBattle(1, undefined, 11.4, superTroop);
      r.unit.native!.effects = slowed
        ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
        : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed,
        scale = slowed ? 2 : 0.5;
      r.untilAttacks(1);
      const first = r.shots[0].at;
      expect(first - engaged + 0.05).toBeCloseTo(0.7 * scale, 8);
      r.untilAttacks(2);
      expect(r.shots[1].at - first).toBeCloseTo(0.7 * scale, 8);
    });
  it(`${kind} retargets a fresh defender with its full charge`, () => {
    const r = attackingWitchBattle(1, undefined, 11.4, superTroop);
    r.step();
    r.step();
    const guard = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, r.unit.x + 2, r.unit.y, 0);
    guard.alerted = true;
    guard.stunnedUntil = 100;
    r.step();
    const engaged = r.battle.elapsed;
    expect(r.unit.native!.attackWindup!.target).toEqual({ id: guard.id, building: false });
    r.untilAttacks(1);
    expect(r.shots[0].at - engaged + 0.05).toBeCloseTo(0.7, 8);
    expect(r.shots[0].shot.targetId).toBe(guard.id);
  });
  it(`${kind} blocking-wall pursuit uses its native projectile and full windup`, () => {
    const r = attackingWitchBattle(1, undefined, 11.4, superTroop);
    for (let y = 0; y < 48; y++) r.battle.buildings.push(makeBuilding(1000 + y, 'wall', 12, y, 15));
    const guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 17.4, 11.5, 0);
    guard.alerted = true;
    guard.stunnedUntil = 100;
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed,
      ref = r.unit.native!.attackWindup!.target!;
    expect(r.battle.buildings.find((b) => b.id === ref.id)?.kind).toBe('wall');
    r.untilAttacks(1);
    expect(r.shots[0].at - engaged + 0.05).toBeCloseTo(0.7, 8);
    expect(r.shots[0].shot).toMatchObject({
      targetBuilding: true,
      targetId: ref.id,
      weapon: 'native',
      native: { name: 'Witch_projectile' },
    });
  });
  it(`${kind} preserves summon stock and cadence across the attack boundary`, () => {
    const old = attackingWitchBattle(1, 165, 11.4, superTroop),
      current = attackingWitchBattle(1, undefined, 11.4, superTroop);
    for (const r of [old, current]) r.until(10);
    const stock = (r) => ({
      summoned: r.unit.native!.summoned,
      summonAt: r.unit.native!.summonAt,
      children: r.battle.units
        .filter((u) => u.native?.owner === r.unit.id)
        .map((u) => ({ kind: u.kind, level: u.level, spawnedAt: u.spawnedAt })),
    });
    expect(current.unit.native!.summoned).toBeGreaterThan(0);
    expect(stock(current)).toEqual(stock(old));
  });
  it(`${kind} version 165 retains immediate building release`, () => {
    const r = attackingWitchBattle(1, 165, 11.4, superTroop);
    r.step();
    expect(r.shots[0].at).toBe(0.05);
    expect(r.unit.native!.attackWindup).toBeUndefined();
  });
  for (const garrison of [false, 'ground', 'air'] as const)
    for (const version of [165, 166])
      it(`${kind} actual ${garrison || 'building'} inputs preserve all version-${version} portable states`, () => {
        const r = attackingWitchRecording(version, 17.6, 8, superTroop, garrison),
          m = new GameModel();
        expect(m.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
        for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          m.seekReplay(snapshot.at);
          while (m.replay!.seeking) m.step(0.05);
          expect(JSON.parse(JSON.stringify(m.battle))).toEqual(snapshot.battle);
        }
      });
}
it('only carried Witch families enable source cast timing', () => {
  const s = structuredClone(attackingWitchBattle().data.initial);
  expect(replayBattle(s).nativeWitchWindup).toBe(true);
  expect(replayBattle(s, 165).nativeWitchWindup).toBeUndefined();
  s.army.witch = 0;
  expect(replayBattle(s).nativeWitchWindup).toBeUndefined();
  s.army.superwitch = 1;
  expect(replayBattle(s).nativeWitchWindup).toBe(true);
});
