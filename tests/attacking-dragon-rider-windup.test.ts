import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { hurtUnit } from '../src/game/native-status';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { nativeDirectBattle } from './fixtures/native-direct-attacks';
import { dragonRiderRecording, dragonRiderDeathRecording } from './fixtures/attacking-dragon-rider';

const damage = [408, 444, 480, 516, 564, 588];
for (let level = 1; level <= 6; level++)
  for (const x of [11.4, 6.9])
    it(`Dragon Rider ${level} starts a 1.2 s charge after approaching from ${x}`, () => {
      const r = nativeDirectBattle('dragonrider', level, undefined, x),
        target = r.battle.buildings.find((b) => b.id === 2)!;
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed,
        hp = target.hp;
      expect(r.unit.native!.attacks ?? 0).toBe(0);
      r.untilAttacks(1);
      const first = r.battle.elapsed,
        shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
      expect(first - engaged + 0.05).toBeCloseTo(1.2, 8);
      expect(shot.native).toMatchObject({
        name: level === 1 ? 'DragonRiderProjectile' : `DragonRiderProjectile ${Math.min(level, 3)}`,
        kind: 'dragonrider',
        level,
      });
      expect(shot.fromAir).toBe(true);
      expect(shot.damage).toBeCloseTo(damage[level - 1], 8);
      expect(shot.impact - shot.launched).toBeCloseTo(
        Math.hypot(shot.x - shot.fromX, shot.y - shot.fromY) / 9.6,
        8,
      );
      expect(target.hp).toBe(hp);
      r.until(shot.impact);
      expect(target.hp).toBeCloseTo(hp - damage[level - 1], 8);
      r.untilAttacks(2);
      expect(r.battle.elapsed - first).toBeCloseTo(1.2, 8);
    });

for (const air of [false, true])
  it(`releases a flying native shot at an eligible ${air ? 'air' : 'ground'} defender`, () => {
    const r = nativeDirectBattle('dragonrider'),
      guard = spawnGarrisonDefender(
        r.battle,
        air ? 'dragon' : 'golem',
        air ? 7 : 8,
        1,
        12,
        11.5,
        0,
      );
    guard.alerted = true;
    guard.stunnedUntil = 100;
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed;
    r.untilAttacks(1);
    const shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
    expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1.2, 8);
    expect(shot).toMatchObject({
      weapon: 'native',
      fromAir: true,
      toAir: air,
      targetDefender: true,
      targetId: guard.id,
    });
    expect(guard.hp).toBe(guard.maxHp);
    r.until(shot.impact);
    expect(guard.hp).toBe(guard.maxHp - 408);
  });

it('ignores nearby storage and defenders while a defense remains, then can retaliate', () => {
  const r = nativeDirectBattle('dragonrider'),
    cannon = makeBuilding(3, 'cannon', 25, 10, 21);
  r.battle.buildings.push(cannon);
  const guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 12, 11.5, 0);
  guard.alerted = true;
  guard.stunnedUntil = 100;
  r.step();
  expect(r.unit.target).toBe(cannon.id);
  expect(r.unit.defenderTarget).toBeUndefined();
  r.model.damage(cannon, cannon.hp);
  r.step();
  expect(r.unit.native!.attackWindup!.target).toEqual({ id: guard.id, building: false });
  r.untilAttacks(1);
  expect(r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!.targetId).toBe(guard.id);
});

it('keeps a committed ordinary building until it falls before switching to a defender', () => {
  const r = nativeDirectBattle('dragonrider');
  r.step();
  const storage = r.battle.buildings.find((b) => b.id === 2)!,
    guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 12, 11.5, 0);
  guard.alerted = true;
  guard.stunnedUntil = 100;
  r.until(0.3);
  expect(r.unit.native!.attackWindup!.target).toEqual({ id: storage.id, building: true });
  r.model.damage(storage, storage.hp);
  r.step();
  const changed = r.battle.elapsed;
  expect(r.unit.native!.attackWindup!.target).toEqual({ id: guard.id, building: false });
  r.untilAttacks(1);
  expect(r.battle.elapsed - changed + 0.05).toBeCloseTo(1.2, 8);
});

it('flies over an unbroken Wall line without attacking it', () => {
  const r = nativeDirectBattle('dragonrider', 1, undefined, 6.9);
  r.battle.buildings.find((b) => b.id === 2)!.x = 22;
  const walls = Array.from({ length: 48 }, (_, y) => makeBuilding(1000 + y, 'wall', 12, y, 15));
  r.battle.buildings.push(...walls);
  r.untilAttacks(1);
  expect(r.unit.x).toBeGreaterThan(12);
  expect(r.unit.target).toBe(2);
  expect(walls.every((w) => w.hp === w.maxHp)).toBe(true);
});

it('Freeze suspends the attack charge', () => {
  const r = nativeDirectBattle('dragonrider');
  r.step();
  const engaged = r.battle.elapsed;
  r.unit.native!.effects = { frozenUntil: engaged + 1 };
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(2.2, 8);
});
for (const slowed of [false, true])
  it(`scales first and repeat charge time, slowed=${slowed}`, () => {
    const r = nativeDirectBattle('dragonrider');
    r.unit.native!.effects = slowed
      ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
      : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed,
      scale = slowed ? 2 : 0.5;
    r.untilAttacks(1);
    const first = r.battle.elapsed;
    expect(first - engaged + 0.05).toBeCloseTo(1.2 * scale, 8);
    r.untilAttacks(2);
    expect(r.battle.elapsed - first).toBeCloseTo(1.2 * scale, 8);
  });

for (let level = 1; level <= 6; level++)
  it(`level ${level}'s delayed ground crash blast still fires while its charge is frozen`, () => {
    const r = nativeDirectBattle('dragonrider', level),
      target = r.battle.buildings.find((b) => b.id === 2)!,
      ground = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 11.6, 11.5, 0),
      air = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, 11.6, 11.5, 0);
    for (const d of [ground, air]) {
      d.alerted = true;
      d.stunnedUntil = 100;
    }
    r.step();
    r.unit.native!.effects = { frozenUntil: 100 };
    hurtUnit(r.battle, r.unit, r.unit.maxHp);
    r.step();
    const blast = r.battle.nativeDeaths!.find((b) => b.sourceId === r.unit.id)!;
    expect(blast).toMatchObject({ damage: 600 + level * 100, radius: 2, air: false });
    expect(blast.at - r.unit.defeatedAt!).toBeCloseTo(0.6, 8);
    expect(r.unit.native!.attacks ?? 0).toBe(0);
    r.until(blast.at - 0.05);
    expect(target.hp).toBe(target.maxHp);
    r.until(blast.at);
    expect(target.hp).toBe(target.maxHp - blast.damage);
    expect(ground.hp).toBe(ground.maxHp - blast.damage);
    expect(air.hp).toBe(air.maxHp);
  });

for (const version of [183, 184])
  for (const level of [1, 6]) {
    for (const guard of [false, true, 'air'] as const)
      it(`level ${level} ${guard || 'Air Defense'} preserves complete version ${version} portable states`, () => {
        const r = dragonRiderRecording(version, level, guard),
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
    it(`level ${level} actual Monolith defeat and blast preserve version ${version} snapshots`, () => {
      const r = dragonRiderDeathRecording(level, version),
        viewer = new GameModel();
      expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        viewer.seekReplay(s.at);
        while (viewer.replay!.seeking) viewer.step(0.05);
        expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
      }
    });
  }
it('only carried Dragon Riders enable the new charge clock', () => {
  const s = structuredClone(nativeDirectBattle('dragonrider').data.initial);
  expect(replayBattle(s).nativeDragonRiderWindup).toBe(true);
  expect(replayBattle(s, 183).nativeDragonRiderWindup).toBeUndefined();
  s.army.dragonrider = 0;
  expect(replayBattle(s).nativeDragonRiderWindup).toBeUndefined();
});
