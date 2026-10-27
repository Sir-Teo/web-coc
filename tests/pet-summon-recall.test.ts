import { expect, it } from 'vitest';
import { petSummonRecallRecording } from './fixtures/pet-summon-recall';
import { GameModel } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

it.each([1, 10])(
  'level %s pet summon ownership survives input-only Recall and reverse seeks',
  (level) => {
    const r = petSummonRecallRecording(level),
      model = new GameModel();
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      model.seekReplay(snapshot.at);
      while (model.replay!.seeking) model.step(0.05);
      expect(model.battle).toEqual(snapshot.battle);
    }
  },
);
