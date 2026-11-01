import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { GameModel, makeBuilding } from '../src/game/model';
import { nativeUnitStats } from '../src/game/native-units';
import { launchRollingLog } from '../src/game/native-log-launcher';
import { stepHeroPiercing } from '../src/game/native-hero-piercing';
import type { NativeTroopContext } from '../src/game/native-troops';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { logLauncherBattle, logLauncherRecording } from './fixtures/attacking-log-launcher';

for (let level = 1; level <= 6; level++)
  it(`Log Launcher ${level} damages along its moving log and stops after four structures`, () => {
    const r = logLauncherBattle(level, 224),
      wall = r.battle.buildings.find((b) => b.id === 2)!,
      hp = wall.hp,
      fifth = r.battle.buildings.find((b) => b.id === 6)!,
      fifthHp = fifth.hp,
      damage = nativeUnitStats('loglauncher', level).damage;
    r.step();
    const shot = r.battle.nativeRollingLogs![0];
    expect(shot).toMatchObject({
      fromX: 5,
      fromY: 12,
      dirX: 1,
      dirY: 0,
      length: 20,
      radius: 1.2,
      speed: 4.2,
      maximumBuildings: 4,
    });
    r.until(0.95);
    expect(wall.hp).toBe(hp);
    r.until(1);
    expect(wall.hp).toBeCloseTo(hp - damage * 4, 8);
    expect(shot.hit.find((h) => h.target.building && h.target.id === 2)!.at).toBeCloseTo(
      0.05 + 3.8 / 4.2,
      8,
    );
    expect(r.unit.x).toBeGreaterThan(5);
    r.until(4);
    expect(shot.hit.map((h) => h.target.id)).toEqual([2, 3, 4, 5]);
    expect(shot).toMatchObject({ buildings: 4, stopped: 'limit' });
    expect(shot.length).toBeCloseTo(13.8, 8);
    expect(fifth.hp).toBe(fifthHp);
  });

for (const level of [1, 6])
  it(`Log Launcher ${level} has a separate one-tile ground blast with one Wall bonus`, () => {
    const r = logLauncherBattle(level, 224),
      stats = nativeUnitStats('loglauncher', level),
      wall = r.battle.buildings.find((b) => b.id === 2)!,
      hp = wall.hp,
      blast = level === 1 ? 2900 : 3600;
    r.unit.x = 9.25;
    const ground = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 9.75, 12, 0),
      air = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, 9.75, 12, 0),
      trap = makeBuilding(10, 'bomb', 9, 12, 1);
    r.battle.buildings.push(trap);
    const ctx: NativeTroopContext = {
      battle: r.battle,
      buildings: r.battle.buildings,
      buildingsById: new Map(r.battle.buildings.map((b) => [b.id, b])),
      passableWalls: new Set(),
      nextId: () => 1000,
      troopLevel: () => level,
      damageBuilding: (b, d, at) => r.model.damage(b, d, at),
      effect: () => {},
    };
    launchRollingLog(ctx, r.unit, stats, stats.damage, { building: r.battle.buildings[0] });
    expect(wall.hp).toBe(Math.max(0, hp - blast * 4));
    expect(ground.hp).toBe(ground.maxHp - blast);
    expect(air.hp).toBe(air.maxHp);
    expect(trap.hp).toBe(trap.maxHp);
  });

it('an Overgrowth-covered structure absorbs a log without taking damage', () => {
  const r = logLauncherBattle(1, 224),
    covered = r.battle.buildings.find((b) => b.id === 3)!,
    hp = covered.hp;
  (r.battle.buildingEffects ??= {})[covered.id] = { overgrownUntil: 100 };
  r.until(2);
  const shot = r.battle.nativeRollingLogs![0];
  expect(shot.stopped).toBe('overgrowth');
  expect(shot.hit.map((h) => h.target.id)).toEqual([2, 3]);
  expect(covered.hp).toBe(hp);
});

it('rolling logs strike ground defenders once and leave air defenders unharmed', () => {
  const r = logLauncherBattle(1, 224),
    ground = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 8, 12, 0),
    air = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, 8, 12, 0);
  for (const d of [ground, air]) {
    d.alerted = true;
    d.stunnedUntil = 100;
  }
  r.until(0.5);
  expect(ground.hp).toBeCloseTo(ground.maxHp - 420, 8);
  expect(air.hp).toBe(air.maxHp);
  const shot = r.battle.nativeRollingLogs![0];
  expect(shot.hit.filter((h) => !h.target.building && h.target.id === ground.id)).toHaveLength(1);
  expect(shot.hit.some((h) => !h.target.building && h.target.id === air.id)).toBe(false);
  r.until(4);
  expect(shot.buildings).toBe(4);
  expect(shot.hit.filter((h) => h.target.building).map((h) => h.target.id)).toEqual([2, 3, 4, 5]);
});

it('a released log finishes its corridor after the caster dies and keeps the battle open', () => {
  const r = logLauncherBattle(1, 224);
  r.step();
  const shot = r.battle.nativeRollingLogs![0];
  r.unit.hp = 0;
  r.battle.remaining.archer = 0;
  r.until(2);
  expect(r.battle.finished).toBe(false);
  while (!r.battle.finished) r.step();
  expect(shot.hit.filter((h) => h.target.building).map((h) => h.target.id)).toEqual([2, 3, 4, 5]);
  expect(shot.stopped).toBe('limit');
  expect(r.battle.elapsed).toBeGreaterThan(3);
  expect(r.battle.elapsed).toBeLessThan(4);
});

it('a log expires at twenty tiles without reaching distant structures', () => {
  const r = logLauncherBattle(1, 224);
  r.battle.buildings = r.battle.buildings.filter((b) => b.id === 1);
  r.step();
  const shot = r.battle.nativeRollingLogs![0],
    townHall = r.battle.buildings[0],
    hp = townHall.hp;
  r.unit.hp = 0;
  r.battle.remaining.archer = 0;
  while (!r.battle.finished) r.step();
  expect(shot.travelled).toBe(20);
  expect(shot.hit).toEqual([]);
  expect(townHall.hp).toBe(hp);
  expect(r.battle.elapsed).toBeCloseTo(4.85, 8);
});

for (const status of ['stunUntil', 'frozenUntil'] as const)
  it(`${status} prevents moving releases until the status expires`, () => {
    const r = logLauncherBattle(1, 224);
    (r.unit.native ??= {}).effects = { [status]: 1 };
    r.until(0.95);
    expect(r.battle.nativeRollingLogs).toBeUndefined();
    expect(r.unit.x).toBe(5);
    r.until(1);
    expect(r.battle.nativeRollingLogs).toHaveLength(1);
    expect(r.battle.nativeRollingLogs![0].launched).toBeCloseTo(1, 8);
  });

for (const version of [223, 224])
  for (const level of [1, 6])
    for (const x of [5, 7])
      it(`Log Launcher ${level} from${x} preserves complete version${version} portable states`, () => {
        const r = logLauncherRecording(level, version, x),
          viewer = new GameModel();
        if (version === 223) {
          const hashes: Record<string, string> = {
            '1:5': 'bb3eba85ae8ca09b85df7e818b9ddb3a4007896092c3c818366737c81771a1de',
            '1:7': '7d03783cfec06d29758cd42ab758ac212985b39675e1087f8845a49b8d4ba781',
            '6:5': '5327fff6891d83348bf9752e33e64617a7bca9236f94da5fb19c7ae1ac3ef993',
            '6:7': '0fea4ee07398195fac21eaa963047d03d6605b17dde86a569e2d1a87da919afe',
          };
          expect(createHash('sha256').update(JSON.stringify(r.snapshots)).digest('hex')).toBe(
            hashes[`${level}:${x}`],
          );
        }
        expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(
          true,
        );
        for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          viewer.seekReplay(snapshot.at);
          while (viewer.replay!.seeking) viewer.step(0.05);
          expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
        }
      });

it('only new carried Log Launcher armies enable physical rolling logs', () => {
  const r = logLauncherBattle(1, 223);
  expect(replayBattle(r.data.initial, 223).nativeLogLauncherPiercing).toBeUndefined();
  expect(replayBattle(r.data.initial, 224).nativeLogLauncherPiercing).toBe(true);
  r.data.initial.army.loglauncher = 0;
  expect(replayBattle(r.data.initial, 224).nativeLogLauncherPiercing).toBeUndefined();
});

it('mixed piercing arrivals skip an earlier destroyed structure consistently across step sizes', () => {
  const run = (times: number[]) => {
    const r = logLauncherBattle(1, 224);
    r.step();
    r.battle.nativeArcherShots = [
      {
        id: 'earlier-arrow',
        sourceId: 999,
        level: 1,
        projectile: 'ArcherArrow',
        fromX: 9,
        fromY: 12,
        dirX: 1,
        dirY: 0,
        length: 2,
        radius: 0,
        speed: 100,
        launched: 0.1,
        travelled: 0,
        damage: 100000,
        hit: [],
      },
    ];
    const ctx: NativeTroopContext = {
      battle: r.battle,
      buildings: r.battle.buildings,
      buildingsById: new Map(r.battle.buildings.map((b) => [b.id, b])),
      passableWalls: new Set(),
      nextId: () => 1000,
      troopLevel: () => 1,
      damageBuilding: (b, d, at) => r.model.damage(b, d, at),
      effect: () => {},
    };
    for (const at of times) {
      r.battle.elapsed = at;
      stepHeroPiercing(ctx);
    }
    const shot = r.battle.nativeRollingLogs![0];
    expect(shot.hit.map((h) => h.target.id)).toEqual([3, 4, 5, 6]);
    expect(shot.stopped).toBe('limit');
    return { shot, hp: r.battle.buildings.map((b) => b.hp) };
  };
  expect(run([5])).toEqual(run(Array.from({ length: 99 }, (_, i) => (i + 2) * 0.05)));
  expect(run([0.73, 1.9, 5])).toEqual(run([5]));
});
