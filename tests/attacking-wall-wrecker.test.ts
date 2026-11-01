import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { nativeDirectBattle } from './fixtures/native-direct-attacks';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { nativeUnitStats } from '../src/game/native-units';
import { wallWreckerBattle, wallWreckerRecording } from './fixtures/attacking-wall-wrecker';

for (let level = 1; level <= 6; level++)
  for (const x of [5, 11.4])
    it(`Wall Wrecker ${level} from ${x} charges its first ram and preserves its repeat period`, () => {
      const r = wallWreckerBattle(level, 229, x, 18),
        target = r.battle.buildings[0],
        hp = target.hp,
        hit = nativeUnitStats('wallwrecker', level).damage;
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed;
      expect(target.hp).toBe(hp);
      r.untilAttacks(1);
      const first = r.battle.elapsed;
      expect(first - engaged + 0.05).toBeCloseTo(0.75, 8);
      expect(target.hp).toBeCloseTo(hp - hit, 8);
      expect(r.unit.native!.attackWindup!.recovery).toBeCloseTo(0.55, 8);
      r.untilAttacks(2);
      expect(r.battle.elapsed - first).toBeCloseTo(1.3, 8);
      expect(target.hp).toBeCloseTo(Math.max(0, hp - 2 * hit), 8);
    });

for (const status of ['frozenUntil', 'stunUntil'] as const)
  it(`${status} holds a partially charged ram without restarting it`, () => {
    const r = wallWreckerBattle(1, 229),
      control = wallWreckerBattle(1, 229);
    control.untilAttacks(1);
    r.until(0.4);
    r.unit.native!.effects = { [status]: r.battle.elapsed + 0.4 };
    r.until(0.75);
    expect(r.unit.native!.attacks ?? 0).toBe(0);
    r.untilAttacks(1);
    expect(r.battle.elapsed - control.battle.elapsed).toBeCloseTo(0.4, 8);
  });

it('target loss during a ram cancels the hit', () => {
  const r = wallWreckerBattle(1, 229),
    target = r.battle.buildings[0];
  r.until(0.4);
  target.hp = 0;
  r.until(1.2);
  expect(r.unit.native!.attacks ?? 0).toBe(0);
  expect(r.unit.native!.attackWindup!.engaged).toBeFalsy();
});

it('a 50% attack slowdown stretches the fresh ram charge', () => {
  const r = wallWreckerBattle(1, 229);
  r.unit.native!.effects = { chill: { until: 100, percent: 0.5 } };
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed;
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1.5, 8);
});

it('an alerted Castle defender does not interrupt the committed building ram', () => {
  const r = nativeDirectBattle('wallwrecker', 1, 229, 11.4, 'garrison'),
    target = r.battle.buildings.find((building) => building.kind === 'townhall')!,
    guard = r.battle.defenders!.find((defender) => defender.kind === 'golem')!,
    hp = target.hp,
    guardHp = guard.hp;
  expect(guard.alerted).toBe(true);
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed;
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(0.75, 8);
  expect(r.unit.native!.attackWindup!.target).toEqual({ id: target.id, building: true });
  expect(target.hp).toBeCloseTo(hp - nativeUnitStats('wallwrecker', 1).damage, 8);
  expect(guard.hp).toBe(guardHp);
});

for (const level of [1, 6])
  it(`Wall Wrecker ${level} charges an actual blocking Wall before applying its tenfold ram`, () => {
    const r = nativeDirectBattle(
      'wallwrecker',
      level,
      229,
      11.4,
      'storage',
      {},
      {
        layout: [
          makeBuilding(1, 'townhall', 18, 10, 1),
          makeBuilding(2, 'goldstorage', 36, 36, 18),
          ...Array.from({ length: 42 }, (_, i) => makeBuilding(i + 3, 'wall', 12, i + 1, 18)),
        ],
      },
    );
    while (!r.unit.native?.attackWindup?.engaged) r.step();
    const engaged = r.battle.elapsed,
      ref = r.unit.native!.attackWindup!.target!,
      wall = r.battle.buildings.find((b) => b.id === ref.id)!;
    expect(ref.building).toBe(true);
    expect(wall.kind).toBe('wall');
    const hp = wall.hp;
    r.untilAttacks(1);
    expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(0.75, 8);
    expect(wall.hp).toBeCloseTo(
      Math.max(0, hp - nativeUnitStats('wallwrecker', level).damage * 10),
      8,
    );
  });

for (const version of [228, 229])
  for (const level of [1, 6])
    for (const x of [5, 11.4])
      it(`Wall Wrecker ${level} from ${x} retains complete version-${version} portable ram states`, () => {
        const r = wallWreckerRecording(level, version, x),
          viewer = new GameModel();
        if (version === 228) {
          const hashes: Record<string, string> = {
            '1:5': '2fb212eb4408a3758c733924d5e4f3f9d9e789d13317a9e666cb7a69333bfced',
            '1:11.4': 'fd7720a5a2f8baffcdba708e37e357a9d417a298f24e845b7c35ec8f1097e01b',
            '6:5': '4b47daf88d6cd427239a8e826569bb4cd47a3ce3bb980964707073c73d3a6cbb',
            '6:11.4': '22ac5b6ced5ab2cb4f14f446c6a9bd51f6669950d7e152c1e2e366d402654116',
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

it('enables the ram phases only for current armies carrying Wall Wrecker', () => {
  const r = wallWreckerBattle();
  expect(replayBattle(r.data.initial, 228).nativeWallWreckerWindup).toBeUndefined();
  expect(replayBattle(r.data.initial, 229).nativeWallWreckerWindup).toBe(true);
  r.data.initial.army.wallwrecker = 0;
  expect(replayBattle(r.data.initial, 229).nativeWallWreckerWindup).toBeUndefined();
});
