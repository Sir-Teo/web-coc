import { expect, it } from 'vitest';
import { nativeHealerRouteRecording } from './fixtures/native-healer-route';
import { GameModel } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

it('replays the ground Druid following an airborne Hound around an untouched storage', () => {
  const r = nativeHealerRouteRecording(),
    model = new GameModel();
  expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
  for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
    model.seekReplay(snapshot.at);
    while (model.replay!.seeking) model.step(0.05);
    expect(model.battle).toEqual(snapshot.battle);
  }
});
