import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { nativeChainOvergrowthRecording } from './fixtures/native-chain-overgrowth';
it.each([1, 9])(
  'a real level-%s dragon chains through actual Overgrowth in portable reverse seeks',
  (level) => {
    const r = nativeChainOvergrowthRecording(level),
      model = new GameModel();
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      model.seekReplay(snapshot.at);
      while (model.replay!.seeking) model.step(0.05);
      expect(model.battle).toEqual(snapshot.battle);
    }
  },
);
