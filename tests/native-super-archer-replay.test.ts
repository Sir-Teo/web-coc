import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { nativeSuperArcherRecording } from './fixtures/native-super-archer';
it.each([
  [1, 'buildings'],
  [10, 'defender'],
] as const)(
  'a real Super Archer %s pierces beyond %s through portable reverse seeks',
  (level, mode) => {
    const r = nativeSuperArcherRecording(level, mode),
      model = new GameModel();
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      model.seekReplay(snapshot.at);
      while (model.replay!.seeking) model.step(0.05);
      expect(model.battle).toEqual(snapshot.battle);
    }
  },
);
