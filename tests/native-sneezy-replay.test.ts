import { expect, it } from 'vitest';
import { nativeSneezyRecording } from './fixtures/native-sneezy';
import { GameModel } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

it.each([1, 10])(
  'Sneezy level %s summons, transforms and fires after actual Cannon wounds through portable reverse seeks',
  (level) => {
    const r = nativeSneezyRecording(level),
      model = new GameModel();
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      model.seekReplay(snapshot.at);
      while (model.replay!.seeking) model.step(0.05);
      expect(model.battle).toEqual(snapshot.battle);
    }
  },
);
