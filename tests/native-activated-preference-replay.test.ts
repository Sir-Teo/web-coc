import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { nativeActivatedPreferenceRecording } from './fixtures/native-activated-preference';

it('a Earthquake-woken Town Hall attracts a new Super Giant through portable reverse seeks', () => {
  const r = nativeActivatedPreferenceRecording(),
    model = new GameModel();
  expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
  for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
    model.seekReplay(snapshot.at);
    while (model.replay!.seeking) model.step(0.05);
    expect(model.battle).toEqual(snapshot.battle);
  }
});

it('version 105 preserves the former native Super Giant target in the same recording', () => {
  const r = nativeActivatedPreferenceRecording(),
    model = new GameModel();
  const data = { ...r.data, version: 105 };
  expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
  model.seekReplay(r.targeted);
  while (model.replay!.seeking) model.step(0.05);
  expect(model.battle!.units.find((u) => u.id === r.secondId)?.target).toBe(r.storageId);
  expect(model.battle!.nativeActivatedPreference).toBeUndefined();
});
