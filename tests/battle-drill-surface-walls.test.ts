import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { GameModel, makeBuilding } from '../src/game/model';
import { castNativeSpell, stepNativeSpells } from '../src/game/native-spells';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { drillSurfaceBattle, drillSurfaceRecording } from './fixtures/battle-drill-surface-walls';

for (const level of [1, 2, 3, 4, 5, 6])
  it(`Battle Drill ${level} destroys an adjacent Wall when its surfacing spell pulses`, () => {
    const r = drillSurfaceBattle(level, 225),
      wall = r.battle.buildings.find((b) => b.id === 3)!,
      far = r.battle.buildings.find((b) => b.id === 6)!;
    while (!r.battle.nativeSpells?.some((c) => c.name === 'DrillerSurfacing')) r.step();
    const cast = r.battle.nativeSpells!.find((c) => c.name === 'DrillerSurfacing')!;
    expect(wall.hp).toBe(wall.maxHp);
    r.step();
    expect(wall.hp).toBe(0);
    expect(far.hp).toBe(far.maxHp);
    expect(r.battle.defenseStuns[2]).toBeCloseTo(cast.firstHit + 2, 8);
    expect(r.unit.native?.surfaced).toBe(true);
    expect(r.unit.native?.burrowed).toBe(false);
  });

it('surfacing destroys boundary Walls while retaining building and defender stun immunities', () => {
  const r = drillSurfaceBattle(1, 225),
    inside = makeBuilding(10, 'wall', 11.5, 10, 18),
    outside = makeBuilding(11, 'wall', 11.5001, 10, 18),
    cannon = makeBuilding(12, 'cannon', 10, 10, 21),
    storage = makeBuilding(13, 'goldstorage', 10, 10, 18),
    trap = makeBuilding(14, 'bomb', 10, 10, 1);
  r.battle.buildings = [inside, outside, cannon, storage, trap];
  const ground = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 10, 10, 0),
    air = spawnGarrisonDefender(r.battle, 'dragon', 7, 1, 10, 10, 0);
  castNativeSpell(r.battle, 'DrillerSurfacing', 1, 'attack', 10, 10);
  stepNativeSpells({
    battle: r.battle,
    damageBuilding: (b, damage, at) => r.model.damage(b, damage, at),
    effect: () => {},
  });
  expect(inside.hp).toBe(0);
  expect(outside.hp).toBe(outside.maxHp);
  for (const b of [cannon, storage, trap]) expect(b.hp).toBe(b.maxHp);
  expect(r.battle.defenseStuns[cannon.id]).toBe(2);
  for (const b of [inside, outside, storage, trap])
    expect(r.battle.defenseStuns[b.id]).toBeUndefined();
  for (const d of [ground, air]) {
    expect(d.hp).toBe(d.maxHp);
    expect(d.stunnedUntil).toBeUndefined();
  }
});

for (const status of ['frozenUntil', 'stunUntil'] as const)
  it(`${status} postpones the surfacing burst until the Drill can emerge`, () => {
    const r = drillSurfaceBattle(1, 225),
      wall = r.battle.buildings.find((b) => b.id === 3)!;
    (r.unit.native ??= {}).effects = { [status]: 1 };
    r.until(0.95);
    expect(r.battle.nativeSpells?.some((c) => c.name === 'DrillerSurfacing')).toBeFalsy();
    expect(wall.hp).toBe(wall.maxHp);
    while (wall.hp > 0) r.step();
    expect(r.battle.elapsed).toBeGreaterThan(1);
    expect(r.battle.defenseStuns[2]).toBeGreaterThan(r.battle.elapsed);
  });

for (const version of [224, 225])
  for (const level of [1, 6])
    for (const x of [5, 10.5])
      it(`Drill ${level} from ${x} reconstructs complete version ${version} portable states`, () => {
        const r = drillSurfaceRecording(level, version, x),
          viewer = new GameModel();
        if (version === 224) {
          const hashes: Record<string, string> = {
            '1:5': '8c42bafd36389c569eaf0113c81c52b9dd6daf3b850fe15d3ca352de9a5ec5eb',
            '1:10.5': 'c4072c400ef62287e6fa3277e481c61c8d091d05b5414026022f16d920744936',
            '6:5': '66fe2db8d6ba082c1cd9ebf67f7dd9268db88fed12c30f7ce1eaa1b7cda36fa5',
            '6:10.5': '43989d57b536a3f45376ac4180376eab6d4ab7b1ffd2475697d52507f48d169f',
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

it('enables the surfacing correction only in new armies carrying Battle Drill', () => {
  const r = drillSurfaceBattle(1, 224);
  expect(r.battle.nativeDrillSurfaceWalls).toBeUndefined();
  expect(replayBattle(r.data.initial, 225).nativeDrillSurfaceWalls).toBe(true);
  r.data.initial.army.battledrill = 0;
  expect(replayBattle(r.data.initial, 225).nativeDrillSurfaceWalls).toBeUndefined();
});
