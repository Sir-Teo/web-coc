import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { nativeMeteorThrowRecording } from './fixtures/native-meteor-throws';

it.each([
  [1, false],
  [3, true],
] as const)(
  'a real Meteor Golem %s (cloned %s) splits through portable reverse seeks',
  (level, cloned) => {
    const r = nativeMeteorThrowRecording(level, cloned),
      model = new GameModel();
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      model.seekReplay(snapshot.at);
      while (model.replay!.seeking) model.step(0.05);
      expect(model.battle).toEqual(snapshot.battle);
    }
  },
);
