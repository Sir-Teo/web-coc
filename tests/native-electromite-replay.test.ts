import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { nativeElectromiteRecording } from './fixtures/native-electromite';

it.each([1, 8])(
  'a naturally spawned Electromite %s chains through portable reverse seeks',
  (level) => {
    const r = nativeElectromiteRecording(level),
      model = new GameModel();
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    expect(r.targets).toHaveLength(3);
    expect(r.targets.some((t) => !t.building)).toBe(true);
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      model.seekReplay(snapshot.at);
      while (model.replay!.seeking) model.step(0.05);
      expect(model.battle).toEqual(snapshot.battle);
    }
  },
);
