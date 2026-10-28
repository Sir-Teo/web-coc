import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { nativeUnitStats } from '../src/game/native-units';
import { garrisonLongShots, garrisonStats } from '../src/game/garrison-kinds';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { hurtUnit } from '../src/game/native-status';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { nativeDirectBattle } from './fixtures/native-direct-attacks';
import {
  superMinionOpeningRecording,
  superMinionDefenderRecording,
} from './fixtures/attacking-super-minion';

const lastShot = (r: ReturnType<typeof nativeDirectBattle>) =>
  r.battle.projectiles!.filter((p) => p.sourceId === r.unit.id).at(-1)!;
for (let level = 1; level <= 11; level++)
  for (const x of [11.4, 4, 1])
    it(`Super Minion tier ${level} spends eight Long Shots before its normal attack from ${x}`, () => {
      const r = nativeDirectBattle('superminion', level, undefined, x),
        target = r.battle.buildings.find((b) => b.id === 2)!,
        damage = nativeUnitStats('superminion', level).damage;
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed,
        openingX = r.unit.x;
      expect(13 - r.unit.x).toBeLessThanOrEqual(9.75 + 1e-8);
      for (let count = 1; count <= 8; count++) {
        r.untilAttacks(count);
        const shot = lastShot(r);
        expect(shot).toMatchObject({
          fromAir: true,
          damage,
          native: { kind: 'superminion', level, name: 'super_gargoyle_projectile_big' },
        });
        expect(shot.splash).toBeUndefined();
        expect(shot.impact - shot.launched).toBeCloseTo(
          Math.hypot(shot.x - shot.fromX, shot.y - shot.fromY) / 6,
          8,
        );
        expect(r.unit.x).toBeCloseTo(openingX, 8);
        expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(count, 8);
      }
      const eighth = r.battle.elapsed;
      if (x <= 4)
        expect(
          r.battle.projectiles!.some((p) => p.sourceId === r.unit.id && p.impact > eighth),
        ).toBe(true);
      r.step();
      while (!r.unit.attacking) r.step();
      const approached = r.battle.elapsed;
      expect(r.unit.native!.attacks).toBe(8);
      expect(13 - r.unit.x).toBeLessThanOrEqual(3.5 + 1e-8);
      if (x <= 4) expect(r.unit.x).toBeGreaterThan(openingX);
      r.untilAttacks(9);
      const ninth = lastShot(r);
      expect(r.battle.elapsed - approached + 0.05).toBeCloseTo(1, 8);
      expect(ninth.native!.name).toBe('super_gargoyle_projectile');
      expect(ninth.impact - ninth.launched).toBeCloseTo(
        Math.hypot(ninth.x - ninth.fromX, ninth.y - ninth.fromY) / 4,
        8,
      );
      r.until(ninth.impact);
      expect(target.hp).toBeCloseTo(target.maxHp - 9 * damage, 8);
    });

for (const air of [false, true])
  for (const level of [1, 11])
    it(`tier ${level} counts ${air ? 'air' : 'ground'} defender releases and approaches after shot eight`, () => {
      const r = nativeDirectBattle('superminion', level),
        kind = air ? 'dragon' : 'golem',
        tier = air ? 7 : 8,
        target = spawnGarrisonDefender(r.battle, kind, tier, 1, r.unit.x + 5, r.unit.y, 0),
        neighbor = spawnGarrisonDefender(r.battle, kind, tier, 1, r.unit.x + 5.1, r.unit.y, 0),
        damage = nativeUnitStats('superminion', level).damage;
      for (const d of [target, neighbor]) {
        d.alerted = true;
        d.stunnedUntil = 100;
      }
      const x = r.unit.x;
      for (let count = 1; count <= 8; count++) {
        r.untilAttacks(count);
        expect(lastShot(r)).toMatchObject({
          targetDefender: true,
          targetId: target.id,
          fromAir: true,
          toAir: air,
          damage,
          native: { name: 'super_gargoyle_projectile_big' },
        });
        expect(r.unit.x).toBe(x);
      }
      r.step();
      while (!r.unit.attacking) r.step();
      const approached = r.battle.elapsed;
      expect(r.unit.native!.attacks).toBe(8);
      expect(r.unit.x).toBeGreaterThan(x);
      r.untilAttacks(9);
      const ninth = lastShot(r);
      expect(r.battle.elapsed - approached + 0.05).toBeCloseTo(1, 8);
      expect(ninth.native!.name).toBe('super_gargoyle_projectile');
      r.until(ninth.impact);
      expect(target.hp).toBe(target.maxHp - 9 * damage);
      expect(neighbor.hp).toBe(neighbor.maxHp);
    });

it('target replacement keeps the remaining offensive ammunition', () => {
  const r = nativeDirectBattle('superminion'),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
  r.untilAttacks(4);
  r.model.damage(target, target.hp);
  r.untilAttacks(5);
  expect(r.unit.target).toBe(3);
  expect(lastShot(r).native!.name).toBe('super_gargoyle_projectile_big');
  r.untilAttacks(9);
  expect(lastShot(r).native!.name).toBe('super_gargoyle_projectile');
});

it('switching from a building to a defender spends the same eight-shot stock', () => {
  const r = nativeDirectBattle('superminion');
  r.untilAttacks(4);
  const guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 12, 11.5, 0);
  guard.alerted = true;
  guard.stunnedUntil = 100;
  r.untilAttacks(5);
  expect(lastShot(r)).toMatchObject({
    targetId: guard.id,
    native: { name: 'super_gargoyle_projectile_big' },
  });
  r.untilAttacks(9);
  expect(lastShot(r)).toMatchObject({
    targetId: guard.id,
    native: { name: 'super_gargoyle_projectile' },
  });
});

it('Freeze holds a charge without consuming ammunition', () => {
  const r = nativeDirectBattle('superminion');
  r.until(0.3);
  const before = structuredClone(r.unit.native!.attackWindup);
  (r.unit.native!.effects ??= {}).frozenUntil = 1.3;
  r.until(1.25);
  expect(r.unit.native!.attacks ?? 0).toBe(0);
  expect(r.unit.native!.attackWindup).toEqual(before);
  r.untilAttacks(1);
  expect(r.battle.elapsed).toBeCloseTo(2, 8);
  expect(lastShot(r).native!.name).toBe('super_gargoyle_projectile_big');
});

it('a canceled target charge leaves all eight Long Shots available', () => {
  const r = nativeDirectBattle('superminion'),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
  r.until(0.4);
  r.model.damage(target, target.hp);
  r.step();
  const changed = r.battle.elapsed;
  expect(r.unit.native!.attacks ?? 0).toBe(0);
  r.untilAttacks(1);
  expect(r.battle.elapsed - changed + 0.05).toBeCloseTo(1, 8);
  r.untilAttacks(8);
  expect(lastShot(r).native!.name).toBe('super_gargoyle_projectile_big');
  r.untilAttacks(9);
  expect(lastShot(r).native!.name).toBe('super_gargoyle_projectile');
});

for (const slowed of [false, true])
  it(`scales the source charge and repeat period, slowed=${slowed}`, () => {
    const r = nativeDirectBattle('superminion');
    r.unit.native!.effects = slowed
      ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
      : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
    r.untilAttacks(1);
    const first = r.battle.elapsed,
      period = slowed ? 2 : 0.5;
    expect(first).toBeCloseTo(period, 8);
    r.untilAttacks(2);
    expect(r.battle.elapsed - first).toBeCloseTo(period, 8);
  });

it('the eighth large projectile retains its own speed and damage after the shooter leaves', () => {
  const r = nativeDirectBattle('superminion', 5, undefined, 4),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  r.untilAttacks(8);
  const shot = lastShot(r);
  hurtUnit(r.battle, r.unit, r.unit.hp);
  r.until(shot.impact);
  expect(shot.native!.name).toBe('super_gargoyle_projectile_big');
  expect(shot.damage).toBe(300);
  expect(target.hp).toBe(target.maxHp - 8 * 300);
});

it('flies over an intact Wall line to its opening range without hitting Walls', () => {
  const r = nativeDirectBattle('superminion', 5, undefined, 4),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  target.x = 25;
  const walls = Array.from({ length: 48 }, (_, y) => makeBuilding(1000 + y, 'wall', 12, y, 18));
  r.battle.buildings.push(...walls);
  r.untilAttacks(1);
  expect(r.unit.x).toBeGreaterThan(12);
  expect(walls.every((w) => w.hp === w.maxHp)).toBe(true);
});

it('defending Super Minions retain their separate three-shot ability', () => {
  expect(garrisonLongShots(garrisonStats('superminion', 9))!.count).toBe(3);
});

for (const version of [186, 187])
  for (const level of [5, 11]) {
    it(`tier ${level} full opening and normal approach preserve version ${version} portable states`, () => {
      const r = superMinionOpeningRecording(level, version),
        viewer = new GameModel();
      expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        viewer.seekReplay(s.at);
        while (viewer.replay!.seeking) viewer.step(0.05);
        expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
      }
    });
    for (const air of [false, true])
      it(`tier ${level} actual ${air ? 'Dragon' : 'Golem'} fight preserves version ${version}`, () => {
        const r = superMinionDefenderRecording(version, level, air),
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
  }

it('only carried Super Minions enable the version 187 ability', () => {
  const r = nativeDirectBattle('superminion');
  expect(replayBattle(r.data.initial, 186).nativeSuperMinionLongShots).toBeUndefined();
  expect(replayBattle(r.data.initial, 187).nativeSuperMinionLongShots).toBe(true);
  r.data.initial.army.superminion = 0;
  expect(replayBattle(r.data.initial, 187).nativeSuperMinionLongShots).toBeUndefined();
});
