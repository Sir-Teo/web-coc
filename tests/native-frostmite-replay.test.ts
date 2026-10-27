import { expect, it } from 'vitest';
import { nativeFrostmiteRecording } from './fixtures/native-frostmite';
import { GameModel } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

it.each([1, 15])(
  'Frosty %s records a Frostmite wall crossing and source leap through portable reverse seeks',
  (level) => {
    const r = nativeFrostmiteRecording(level),
      model = new GameModel();
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      model.seekReplay(snapshot.at);
      while (model.replay!.seeking) model.step(0.05);
      expect(model.battle).toEqual(snapshot.battle);
    }
  },
);
