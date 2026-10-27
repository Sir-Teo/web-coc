import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { replayBattle } from '../src/game/replay';
import { attackingBowlerBattle } from './fixtures/attacking-bowler';
import { bowlerBouldersRecording } from './fixtures/bowler-boulders';

function arena(level = 1, version?: number) {
  const r = attackingBowlerBattle(level, version);
  r.battle.buildings = r.battle.buildings.filter((b) => b.id === 1);
  const spawn = (x: number, air = false) => {
    const d = spawnGarrisonDefender(
      r.battle,
      air ? 'lavahound' : 'golem',
      air ? 6 : 8,
      1,
      x,
      11.5,
      0,
    );
    d.alerted = true;
    d.stunnedUntil = 100;
    return d;
  };
  const target = spawn(13);
  return { ...r, target, spawn };
}

for (const [index, dps] of [60, 72, 84, 96, 102, 108, 114, 126, 140, 160].entries())
  it(`Bowler ${index + 1} uses native speed and deals its source splash once`, () => {
    const r = arena(index + 1),
      nearby = r.spawn(13.2),
      air = r.spawn(13.1, true);
    r.untilAttacks(1);
    const shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
    expect(shot).toMatchObject({
      weapon: 'native',
      targetDefender: true,
      native: { kind: 'bowler' },
      splash: 0.3,
    });
    expect(shot.impact - shot.launched).toBeCloseTo(1.6 / 4.75, 8);
    while (r.battle.projectiles!.some((p) => p.id === shot.id)) r.step();
    expect(r.target.hp).toBeCloseTo(r.target.maxHp - dps * 2.2, 8);
    expect(nearby.hp).toBeCloseTo(nearby.maxHp - dps * 2.2, 8);
    expect(air.hp).toBe(air.maxHp);
  });

it('the fixed second landing uses captured launch aim after its primary target moves', () => {
  const r = arena(),
    landing = r.spawn(17.8),
    air = r.spawn(17.7, true);
  r.target.x = 13.6;
  const outside = makeBuilding(3, 'goldstorage', 18, 10, 18);
  r.battle.buildings.push(outside);
  r.untilAttacks(1);
  const shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
  r.target.x = 14.4;
  while (r.battle.projectiles!.some((p) => p.id === shot.id)) r.step();
  const bounce = r.battle.projectiles!.find(
    (p) => p.sourceId === r.unit.id && p.native?.bounce === 1,
  )!;
  expect(bounce).toBeDefined();
  expect(bounce).toMatchObject({
    x: 17.6,
    y: 11.5,
    fromX: 14.4,
    fromY: 11.5,
    splash: 0.3,
    targetBuilding: false,
  });
  expect(bounce.impact - bounce.launched).toBeCloseTo(3.2 / 4.75, 8);
  while (r.battle.projectiles!.some((p) => p.id === bounce.id)) r.step();
  expect(landing.hp).toBeCloseTo(landing.maxHp - 132, 8);
  expect(air.hp).toBe(air.maxHp);
  expect(outside.hp).toBe(outside.maxHp);
  expect(r.battle.projectiles!.some((p) => p.sourceId === r.unit.id)).toBe(false);
});

it('a fixed bounce cannot follow an attacker whose id overlaps the original building', () => {
  const r = attackingBowlerBattle();
  r.battle.buildings.find((b) => b.id === 2)!.id = r.unit.id;
  r.untilAttacks(1);
  const first = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
  while (r.battle.projectiles!.some((p) => p.id === first.id)) r.step();
  const bounce = r.battle.projectiles!.find((p) => p.native?.bounce === 1)!;
  const point = { x: bounce.x, y: bounce.y };
  r.step();
  expect({ x: bounce.x, y: bounce.y }).toEqual(point);
  expect(point.x).toBeGreaterThan(17);
});

it('version 156 keeps the established arrow against defending units', () => {
  const r = arena(1, 156);
  r.untilAttacks(1);
  expect(r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!.weapon).toBe('arrow');
});

it('a released boulder completes both impacts after its thrower falls', () => {
  const r = arena(),
    landing = r.spawn(17);
  r.untilAttacks(1);
  r.unit.hp = 0;
  r.until(1.7);
  expect(r.target.hp).toBeCloseTo(r.target.maxHp - 132, 8);
  expect(landing.hp).toBeCloseTo(landing.maxHp - 132, 8);
});

it('bounce splash ignores a defender born after the exact impact but before its update frame', () => {
  const r = arena();
  r.untilAttacks(1);
  const first = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
  while (r.battle.projectiles!.some((p) => p.id === first.id)) r.step();
  const bounce = r.battle.projectiles!.find((p) => p.native?.bounce === 1)!;
  const future = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 17, 11.5, bounce.impact + 0.01);
  future.stunnedUntil = 100;
  r.until(bounce.impact + 0.05);
  expect(future.hp).toBe(future.maxHp);
});

for (const version of [156, 157])
  it(`actual Castle releases preserve full version-${version} boulder snapshots`, () => {
    const r = bowlerBouldersRecording(version),
      model = new GameModel();
    expect(r.bounce !== undefined).toBe(version === 157);
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      model.seekReplay(snapshot.at);
      while (model.replay!.seeking) model.step(0.05);
      expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
    }
  });

it('only carried Bowler armies allocate native boulder rules', () => {
  const s = structuredClone(attackingBowlerBattle().data.initial);
  expect(replayBattle(s).nativeBowlerBoulders).toBe(true);
  expect(replayBattle(s, 156).nativeBowlerBoulders).toBeUndefined();
  s.army.bowler = 0;
  expect(replayBattle(s).nativeBowlerBoulders).toBeUndefined();
});
