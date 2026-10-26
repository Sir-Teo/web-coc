import { expect, it } from 'vitest';
import { nativeHealingRecording } from './fixtures/native-healing';
import { GameModel } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

it.each(['unicorn', 'druid'] as const)(
  '%s Cannon recovery replays exactly in both directions',
  (kind) => {
    const r = nativeHealingRecording(kind);
    const model = new GameModel();
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      model.seekReplay(snapshot.at);
      while (model.replay!.seeking) model.step(0.05);
      expect(model.battle).toEqual(snapshot.battle);
    }
  },
);
