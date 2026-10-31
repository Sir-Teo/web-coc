import { expect, it } from 'vitest';
import { maxTroopLevel } from '../src/game/data';
import { GameModel, type Battle } from '../src/game/model';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { nativeDirectBattle } from './fixtures/native-direct-attacks';
import { attackContactRecording } from './fixtures/attack-contact-pose';

const withoutContactFlag = (battle: Battle) => {
  const copy = JSON.parse(JSON.stringify(battle));
  delete copy.nativeAttackContactPose;
  return copy;
};
for (const kind of ['archer', 'minion', 'wizard', 'dragon', 'rootrider'] as const)
  for (const level of [1, maxTroopLevel(kind)]) {
    for (const x of [11.4, 6.9])
      it(`${kind} ${level} keeps complete combat state from approach ${x}`, () => {
        const old = nativeDirectBattle(kind, level, 215, x),
          current = nativeDirectBattle(kind, level, 216, x);
        for (let i = 0; i < 160; i++) {
          expect(withoutContactFlag(current.battle)).toEqual(withoutContactFlag(old.battle));
          if (i < 159) {
            old.step();
            current.step();
          }
        }
      });
    for (const version of [215, 216])
      it(`${kind} ${level} contact snapshots replay ${version} in both directions`, () => {
        const r = attackContactRecording(kind, version, level),
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

it('enables the render-only contact boundary only from version 216', () => {
  const r = nativeDirectBattle('archer', 1, 215);
  expect(replayBattle(r.data.initial, 215).nativeAttackContactPose).toBeUndefined();
  expect(replayBattle(r.data.initial, 216).nativeAttackContactPose).toBe(true);
});
