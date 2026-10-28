import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { wallBreakerRecording } from './fixtures/attacking-wall-breaker';
import { nativeUnitStats } from '../src/game/native-units';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { hurtUnit } from '../src/game/native-status';
import { replayBattle } from '../src/game/replay';
import { emptyArmy } from '../src/game/army';
import { applyShrink } from '../src/game/shrink-trap';
import { nativeDirectBattle } from './fixtures/native-direct-attacks';

for (let level = 1; level <= 14; level++)
  for (const x of [11.4, 6.9])
    it(`Wall Breaker ${level} spends its source charge before separate attack and death damage from ${x}`, () => {
      const r = nativeDirectBattle('wallbreaker', level, 206, x),
        target = r.battle.buildings.find((b) => b.id === 2)!,
        stats = nativeUnitStats('wallbreaker', level);
      expect(r.model.troopStats('wallbreaker')).toMatchObject({
        range: 0.5,
        splash: 0.8,
        deathRadius: 1.5,
      });
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed;
      expect(target.hp).toBe(target.maxHp);
      expect(r.unit.native!.attackWindup!.animationOffset).toBeLessThan(0);
      r.untilAttacks(1);
      expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1, 8);
      expect(r.unit).toMatchObject({ hp: 0, spent: true, defeatedAt: r.battle.elapsed });
      expect(target.hp).toBe(target.maxHp - stats.damage);
      expect(r.battle.nativeDeaths).toEqual([
        {
          sourceId: r.unit.id,
          x: r.unit.x,
          y: r.unit.y,
          at: r.unit.defeatedAt,
          damage: stats.deathDamage,
          radius: 1.5,
          air: false,
          wallMultiplier: 40,
        },
      ]);
      r.step();
      expect(target.hp).toBe(target.maxHp - stats.damage - stats.deathDamage);
      const after = target.hp;
      r.until(r.battle.elapsed + 0.5);
      expect(target.hp).toBe(after);
      expect(r.unit.native!.attacks).toBe(1);
    });

for (let level = 1; level <= 14; level++)
  it(`Wall Breaker ${level} applies the source Wall bonus to both separate blasts`, () => {
    const r = nativeDirectBattle(
        'wallbreaker',
        level,
        206,
        6.9,
        'storage',
        {},
        {
          extraBuildings: Array.from({ length: 48 }, (_, y) =>
            makeBuilding(1000 + y, 'wall', 12, y, 18),
          ),
        },
      ),
      stats = nativeUnitStats('wallbreaker', level);
    r.untilAttacks(1);
    const walls = r.battle.buildings.filter((b) => b.kind === 'wall' && b.hp < b.maxHp),
      before = walls.map((b) => b.hp);
    expect(walls.length).toBeGreaterThan(0);
    for (const wall of walls) expect(wall.maxHp - wall.hp).toBe(stats.damage * 40);
    r.step();
    for (const [i, wall] of walls.entries())
      expect(wall.hp).toBe(Math.max(0, before[i] - stats.deathDamage * 40));
  });

it('the attack uses its own 0.8-tile ground splash before the self-centered death blast', () => {
  const r = nativeDirectBattle('wallbreaker', 14, 206),
    near = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 15.29, 11.5, 0),
    far = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 15.31, 11.5, 0),
    air = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, 15.29, 11.5, 0);
  for (const d of [near, far, air]) {
    d.alerted = true;
    d.stunnedUntil = 100;
  }
  r.untilAttacks(1);
  expect(near.hp).toBe(near.maxHp - 126);
  expect(far.hp).toBe(far.maxHp);
  expect(air.hp).toBe(air.maxHp);
});

it('the separate death blast reaches 1.5 tiles from the caster and excludes airborne defenders', () => {
  const r = nativeDirectBattle('wallbreaker', 14, 206);
  r.untilAttacks(1);
  const near = spawnGarrisonDefender(
      r.battle,
      'golem',
      8,
      1,
      r.unit.x - 1.49,
      r.unit.y,
      r.battle.elapsed,
    ),
    far = spawnGarrisonDefender(
      r.battle,
      'golem',
      8,
      1,
      r.unit.x - 1.51,
      r.unit.y,
      r.battle.elapsed,
    ),
    air = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, r.unit.x, r.unit.y, r.battle.elapsed);
  for (const d of [near, far, air]) {
    d.alerted = true;
    d.stunnedUntil = 100;
  }
  r.step();
  expect(near.hp).toBe(near.maxHp - 78);
  expect(far.hp).toBe(far.maxHp);
  expect(air.hp).toBe(air.maxHp);
});

it('defeat during charge resolves death damage once without an attack', () => {
  const r = nativeDirectBattle('wallbreaker', 14, 206),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  while (!r.unit.attacking) r.step();
  hurtUnit(r.battle, r.unit, r.unit.hp);
  r.step();
  expect(target.hp).toBe(target.maxHp);
  r.step();
  expect(target.hp).toBe(target.maxHp - 78);
  r.until(r.battle.elapsed + 1);
  expect(target.hp).toBe(target.maxHp - 78);
  expect(r.unit.native!.attacks).toBeUndefined();
});

it('an ejected casualty does not detonate', () => {
  const r = nativeDirectBattle('wallbreaker', 14, 206),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  while (!r.unit.attacking) r.step();
  r.unit.ejected = true;
  hurtUnit(r.battle, r.unit, r.unit.hp);
  r.step();
  r.step();
  expect(target.hp).toBe(target.maxHp);
  expect(r.battle.nativeDeaths ?? []).toEqual([]);
});

it('the final-unit pending death blast can award the final stars', () => {
  const r = nativeDirectBattle('wallbreaker', 14, 206),
    target = r.battle.buildings.find((b) => b.id === 2)!,
    hall = r.battle.buildings.find((b) => b.id === 1)!;
  r.model.damage(hall, hall.hp);
  r.model.damage(target, target.hp - 126 - 70);
  r.battle.remaining = emptyArmy();
  r.untilAttacks(1);
  expect(r.battle.finished).toBe(false);
  expect(target.hp).toBe(70);
  r.step();
  expect(r.battle.result).toMatchObject({ stars: 3, destruction: 100 });
});

it('only a carried ordinary Wall Breaker enables the source migration', () => {
  const r = nativeDirectBattle('wallbreaker');
  expect(replayBattle(r.data.initial, 205).nativeWallBreakerWindup).toBeUndefined();
  expect(replayBattle(r.data.initial, 206).nativeWallBreakerWindup).toBe(true);
  r.data.initial.army.wallbreaker = 0;
  expect(replayBattle(r.data.initial, 206).nativeWallBreakerWindup).toBeUndefined();
});

for (const version of [205, 206])
  for (const level of [1, 10])
    it(`Super Wall Breaker ${level} retains version ${version}'s ground contact splash`, () => {
      const r = nativeDirectBattle('superwallbreaker', level, version),
        near = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 15.29, 11.5, 0),
        far = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 15.31, 11.5, 0),
        air = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, 15.29, 11.5, 0);
      for (const d of [near, far, air]) {
        d.alerted = true;
        d.stunnedUntil = 100;
      }
      r.untilAttacks(1);
      expect(near.hp).toBe(
        near.maxHp - (version === 206 ? nativeUnitStats('superwallbreaker', level).damage : 0),
      );
      expect(far.hp).toBe(far.maxHp);
      expect(air.hp).toBe(air.maxHp);
    });

it('only the Wall Breaker family enables the source contact splash', () => {
  const r = nativeDirectBattle('superwallbreaker');
  expect(replayBattle(r.data.initial, 205).nativeWallBreakerSplash).toBeUndefined();
  expect(replayBattle(r.data.initial, 206).nativeWallBreakerSplash).toBe(true);
  r.data.initial.army.superwallbreaker = 0;
  expect(replayBattle(r.data.initial, 206).nativeWallBreakerSplash).toBeUndefined();
});

it('Freeze holds the ordinary charge before a single release', () => {
  const r = nativeDirectBattle('wallbreaker', 14, 206);
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed;
  r.unit.native!.effects = { frozenUntil: engaged + 1 };
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(2, 8);
});

for (const slowed of [false, true])
  it(`ordinary charge follows action-rate changes, slowed=${slowed}`, () => {
    const r = nativeDirectBattle('wallbreaker', 14, 206);
    r.step();
    r.unit.native!.effects = slowed
      ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
      : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed;
    r.untilAttacks(1);
    expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(slowed ? 2 : 0.5, 8);
  });

it('Shrink scales the charge without reducing ordinary attack or death damage', () => {
  const r = nativeDirectBattle('wallbreaker', 14, 206),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  applyShrink(r.unit, 0);
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed;
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(2, 8);
  expect(target.hp).toBe(target.maxHp - 126);
  r.step();
  expect(target.hp).toBe(target.maxHp - 126 - 78);
});

it('damage boosts scale the ordinary contact attack while death damage stays separate', () => {
  const r = nativeDirectBattle('wallbreaker', 14, 206),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  r.step();
  r.unit.native!.effects = { boost: { until: 100, damage: 1, speed: 0, attackSpeed: 0 } };
  r.untilAttacks(1);
  expect(target.hp).toBe(target.maxHp - 252);
  r.step();
  expect(target.hp).toBe(target.maxHp - 252 - 78);
});

for (const kind of ['bomb', 'airbomb', 'seekingairmine'] as const)
  it(`ordinary source migration preserves ${kind} trigger eligibility`, () => {
    const r = nativeDirectBattle('wallbreaker', 14, 206),
      trap = makeBuilding(3, kind, 11, 11, 1);
    r.battle.buildings.push(trap);
    r.step();
    expect(r.unit.native?.attacks ?? 0).toBe(0);
    expect(r.battle.traps[trap.id] !== undefined).toBe(kind === 'bomb');
  });

for (const version of [205, 206])
  for (const level of [1, 14])
    for (const target of ['storage', 'cannon', 'wall'] as const)
      it(`actual Wall Breaker ${level} ${target} reconstructs version ${version} forward and backward`, () => {
        const r = wallBreakerRecording(version, level, target, target === 'wall' ? 6.9 : 11.4),
          viewer = new GameModel();
        expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(
          true,
        );
        for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          viewer.seekReplay(s.at);
          while (viewer.replay!.seeking) viewer.step(0.05);
          expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
        }
      });

for (const level of [1, 14])
  for (const x of [11.4, 6.9])
    it(`version 205 retains the immediate combined tier ${level} blast from ${x}`, () => {
      const r = nativeDirectBattle('wallbreaker', level, 205, x),
        target = r.battle.buildings.find((b) => b.id === 2)!,
        stats = nativeUnitStats('wallbreaker', level);
      expect(r.model.troopStats('wallbreaker')).toMatchObject({ range: 1, deathRadius: 2 });
      while (r.unit.hp > 0) r.step();
      expect(r.battle.elapsed).toBeCloseTo(x === 11.4 ? 0.3 : 1.8, 8);
      expect(target.hp).toBe(target.maxHp - stats.damage - stats.deathDamage);
      expect(r.unit.native?.attackWindup).toBeUndefined();
      expect(r.battle.nativeDeaths).toBeUndefined();
    });
