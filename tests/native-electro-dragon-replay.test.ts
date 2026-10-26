import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { nativeElectroDragonRecording } from './fixtures/native-electro-dragon';
it.each([
  [1, 'buildings'],
  [9, 'defender'],
] as const)(
  'a real Electro Dragon %s chains from %s through portable reverse seeks',
  (level, mode) => {
    const r = nativeElectroDragonRecording(level, mode),
      model = new GameModel();
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      model.seekReplay(snapshot.at);
      while (model.replay!.seeking) model.step(0.05);
      expect(model.battle).toEqual(snapshot.battle);
    }
  },
);
