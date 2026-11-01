import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { movingSiegeBattle, movingSiegeRecording } from './fixtures/moving-siege';

for (const kind of ['battleblimp', 'loglauncher'] as const)
  for (const level of [1, 6])
    for (const status of ['frozenUntil', 'stunUntil'] as const)
      for (const version of [230, 231])
        it(`${kind} ${level} ${status} retains the version-${version} moving release clock`, () => {
          const r = movingSiegeBattle(kind, level, version),
            control = movingSiegeBattle(kind, level, version);
          r.untilAttacks(1);
          control.untilAttacks(2);
          const normal = control.battle.elapsed,
            first = r.battle.elapsed;
          r.until(first + 0.15);
          const before = r.unit.cooldown,
            heldUntil = r.battle.elapsed + 0.5;
          r.unit.native!.effects = { [status]: heldUntil };
          r.until(heldUntil);
          expect(r.unit.native!.attacks).toBe(1);
          expect(r.unit.cooldown).toBeCloseTo(before - (version < 231 ? 0.5 : 0), 8);
          r.untilAttacks(2);
          expect(r.battle.elapsed - normal).toBeCloseTo(version < 231 ? 0 : 0.5, 8);
        });

for (const kind of ['battleblimp', 'loglauncher'] as const) {
  it(`${kind} spends only the active remainder when a native hold ends inside a sample`, () => {
    const r = movingSiegeBattle(kind, 1, 231);
    r.untilAttacks(1);
    const before = r.unit.cooldown;
    r.unit.native!.effects = { stunUntil: r.battle.elapsed + 0.07 };
    r.model.step(0.2);
    expect(r.unit.cooldown).toBeCloseTo(before - 0.13, 10);
  });

  it(`${kind} keeps the later expiry of overlapping Freeze and stun`, () => {
    const r = movingSiegeBattle(kind, 1, 231);
    r.untilAttacks(1);
    const before = r.unit.cooldown,
      until = r.battle.elapsed + 0.8;
    r.unit.native!.effects = { frozenUntil: r.battle.elapsed + 0.5, stunUntil: until };
    r.until(until);
    expect(r.unit.cooldown).toBeCloseTo(before, 10);
    r.step();
    expect(r.unit.cooldown).toBeCloseTo(before - 0.05, 10);
  });
}

for (const kind of ['battleblimp', 'loglauncher'] as const)
  for (const level of [1, 6])
    for (const version of [230, 231])
      it(`${kind} ${level} reconstructs complete version-${version} portable moving releases`, () => {
        const r = movingSiegeRecording(kind, level, version),
          viewer = new GameModel();
        if (version === 230) {
          const hashes: Record<string, string> = {
            'battleblimp:1': '8e2d74cc1bfe33a15a909d25512d68da1f6520872625aeff56d9d67cdfb9545c',
            'battleblimp:6': '05dfbe71fe0ffffeca029fa9a96eb1fee05331e0291eabde9851630d650203c7',
            'loglauncher:1': 'f2048413098a551acb3fcad933051339c63849f44a189b85145c68d10d4c9cee',
            'loglauncher:6': '88352bc98431483302c922f7e98fdd2ab5dd02139810f29f4a7923d3146df1d7',
          };
          expect(createHash('sha256').update(JSON.stringify(r.snapshots)).digest('hex')).toBe(
            hashes[`${kind}:${level}`],
          );
        } else {
          const control = movingSiegeRecording(kind, level, 230),
            normalized = JSON.parse(JSON.stringify(r.snapshots)) as typeof r.snapshots;
          for (const snapshot of normalized) delete snapshot.battle.nativeMovingSiegeFreezeClock;
          expect(normalized).toEqual(control.snapshots);
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

it('enables the moving Freeze clock only in new armies carrying a moving-fire siege', () => {
  const r = movingSiegeBattle('battleblimp');
  expect(replayBattle(r.data.initial, 230).nativeMovingSiegeFreezeClock).toBeUndefined();
  expect(replayBattle(r.data.initial, 231).nativeMovingSiegeFreezeClock).toBe(true);
  r.data.initial.army.battleblimp = 0;
  expect(replayBattle(r.data.initial, 231).nativeMovingSiegeFreezeClock).toBeUndefined();
});
