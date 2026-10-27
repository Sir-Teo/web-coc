import { expect, it } from 'vitest';
import { nativeMiteJumpRecording } from './fixtures/native-mite-jumps';
import { GameModel } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

it.each(['yetimite', 'firemite'] as const)(
  '%s naturally spawns and leaps at a defending Hero through portable reverse seeks',
  (kind) => {
    const r = nativeMiteJumpRecording(kind),
      model = new GameModel();
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      model.seekReplay(snapshot.at);
      while (model.replay!.seeking) model.step(0.05);
      expect(model.battle).toEqual(snapshot.battle);
    }
  },
);
