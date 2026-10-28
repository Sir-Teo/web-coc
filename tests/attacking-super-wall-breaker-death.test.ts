import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { hurtUnit } from '../src/game/native-status';
import { nativeUnitStats } from '../src/game/native-units';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { emptyArmy } from '../src/game/army';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { nativeDirectBattle } from './fixtures/native-direct-attacks';
import { superWallBreakerRecording } from './fixtures/attacking-super-wall-breaker';

for (let level = 1; level <= 10; level++)
  for (const x of [11.4, 6.9])
    it(`tier ${level} completes its single attack and then resolves its death blast, drop=${x}`, () => {
      const r = nativeDirectBattle('superwallbreaker', level, 204, x),
        target = r.battle.buildings.find((b) => b.id === 2)!,
        stats = nativeUnitStats('superwallbreaker', level),
        blasts: unknown[] = [];
      r.model.onEffect = (fx) => {
        if (fx.type === 'blast') blasts.push(fx);
      };
      r.untilAttacks(1);
      expect(r.unit).toMatchObject({ hp: 0, spent: true, defeatedAt: r.battle.elapsed });
      expect(target.hp).toBe(target.maxHp - stats.damage);
      expect(r.battle.nativeDeaths).toEqual([
        {
          sourceId: r.unit.id,
          x: r.unit.x,
          y: r.unit.y,
          at: r.unit.defeatedAt,
          damage: stats.deathDamage,
          radius: 1.6,
          air: false,
          wallMultiplier: 40,
        },
      ]);
      r.step();
      expect(target.hp).toBe(target.maxHp - stats.damage - stats.deathDamage);
      expect(r.battle.nativeDeaths).toEqual([]);
      expect(blasts).toHaveLength(1);
      const after = target.hp;
      r.until(r.battle.elapsed + 0.5);
      expect(target.hp).toBe(after);
      expect(blasts).toHaveLength(1);
      expect(r.unit.native!.attacks).toBe(1);
    });

for (const level of [1, 10])
  it(`version 203 retains tier ${level}'s historical completed attack without a death blast`, () => {
    const r = nativeDirectBattle('superwallbreaker', level, 203),
      target = r.battle.buildings.find((b) => b.id === 2)!;
    r.untilAttacks(1);
    r.step();
    expect(target.hp).toBe(target.maxHp - nativeUnitStats('superwallbreaker', level).damage);
    expect(r.battle.nativeDeaths).toBeUndefined();
    expect(r.battle.nativeSuperWallBreakerDeath).toBeUndefined();
  });

it('the casualty blast includes ground defenders inside its own radius and excludes air', () => {
  const r = nativeDirectBattle('superwallbreaker', 1, 204);
  r.untilAttacks(1);
  const ground = spawnGarrisonDefender(
      r.battle,
      'golem',
      8,
      1,
      r.unit.x,
      r.unit.y,
      r.battle.elapsed,
    ),
    air = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, r.unit.x, r.unit.y, r.battle.elapsed),
    far = spawnGarrisonDefender(r.battle, 'golem', 8, 1, r.unit.x - 4, r.unit.y, r.battle.elapsed);
  for (const d of [ground, air, far]) {
    d.alerted = true;
    d.stunnedUntil = 100;
  }
  r.step();
  expect(ground.hp).toBe(ground.maxHp - 105);
  expect(air.hp).toBe(air.maxHp);
  expect(far.hp).toBe(far.maxHp);
});

it('a pending last-unit blast keeps the battle alive to award its final stars', () => {
  const r = nativeDirectBattle('superwallbreaker', 1, 204),
    target = r.battle.buildings.find((b) => b.id === 2)!,
    hall = r.battle.buildings.find((b) => b.id === 1)!;
  r.model.damage(hall, hall.hp);
  r.model.damage(target, target.hp - 34 - 100);
  r.battle.remaining = emptyArmy();
  r.untilAttacks(1);
  expect(r.battle.finished).toBe(false);
  expect(target.hp).toBe(100);
  r.step();
  expect(target.hp).toBe(0);
  expect(r.battle).toMatchObject({ finished: true, destruction: 100, stars: 3 });
});

for (const version of [203, 204])
  for (const level of [1, 10])
    for (const target of ['storage', 'cannon', 'wall'] as const)
      it(`actual tier ${level} ${target} reconstructs death and explosion for version ${version}`, () => {
        const r = superWallBreakerRecording(version, level, target, target === 'wall' ? 6.9 : 11.4),
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

it('a live Cannon casualty retains every historical physical state', () => {
  const old = superWallBreakerRecording(203, 1, 'cannon'),
    current = superWallBreakerRecording(204, 1, 'cannon');
  expect(current.snapshots.map((s) => s.at)).toEqual(old.snapshots.map((s) => s.at));
  for (const [i, s] of current.snapshots.entries()) {
    const physical = structuredClone(s.battle);
    delete physical.nativeSuperWallBreakerDeath;
    for (const blast of physical.nativeDeaths ?? []) delete blast.wallMultiplier;
    expect(physical).toEqual(old.snapshots[i].battle);
  }
});

it('only a carried Super Wall Breaker enables the new casualty path', () => {
  const r = nativeDirectBattle('superwallbreaker');
  expect(replayBattle(r.data.initial, 203).nativeSuperWallBreakerDeath).toBeUndefined();
  expect(replayBattle(r.data.initial, 204).nativeSuperWallBreakerDeath).toBe(true);
  r.data.initial.army.superwallbreaker = 0;
  expect(replayBattle(r.data.initial, 204).nativeSuperWallBreakerDeath).toBeUndefined();
});

for (let level = 1; level <= 10; level++) {
  it(`tier ${level} applies its 40-fold Wall bonus to the completed-attack death blast`, () => {
    const r = nativeDirectBattle(
        'superwallbreaker',
        level,
        204,
        6.9,
        'storage',
        {},
        {
          extraBuildings: Array.from({ length: 48 }, (_, y) =>
            makeBuilding(1000 + y, 'wall', 12, y, 18),
          ),
        },
      ),
      stats = nativeUnitStats('superwallbreaker', level);
    r.untilAttacks(1);
    const walls = r.battle.buildings.filter((b) => b.kind === 'wall' && b.hp < b.maxHp),
      before = walls.map((b) => b.hp);
    expect(walls.length).toBeGreaterThan(0);
    for (const wall of walls) expect(wall.maxHp - wall.hp).toBe(stats.damage * 40);
    r.step();
    for (const [i, wall] of walls.entries())
      expect(wall.hp).toBe(Math.max(0, before[i] - stats.deathDamage * 40));
  });
  for (const version of [203, 204])
    it(`tier ${level} pre-attack casualty uses version ${version}'s Wall multiplier only on Walls`, () => {
      const r = nativeDirectBattle('superwallbreaker', level, version),
        wall = makeBuilding(3, 'wall', 12, 11, 18),
        storage = r.battle.buildings.find((b) => b.id === 2)!,
        death = nativeUnitStats('superwallbreaker', level).deathDamage;
      r.battle.buildings.push(wall);
      hurtUnit(r.battle, r.unit, r.unit.hp);
      r.step();
      r.step();
      expect(r.unit.native!.attacks).toBeUndefined();
      expect(wall.hp).toBe(Math.max(0, wall.maxHp - death * (version === 204 ? 40 : 1)));
      expect(storage.hp).toBe(storage.maxHp - death);
    });
}
