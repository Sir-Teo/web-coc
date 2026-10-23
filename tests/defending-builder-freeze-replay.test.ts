import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import {
  compatibleReplayVersion,
  REPLAY_VERSION,
  replayBattle,
  validateReplay,
} from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { defendingBuilderFreezeRecording } from './fixtures/defending-builder-freeze';

it('reconstructs Freeze repairs exactly across backward seeks and preserves version-56 playback', () => {
  const { data, snapshots, laterFrozen } = defendingBuilderFreezeRecording();
  expect(REPLAY_VERSION).toBeGreaterThanOrEqual(57);
  expect(data.version).toBe(REPLAY_VERSION);
  expect(validateReplay(data)).toBe(true);
  const old = { ...data, version: 56 };
  expect(compatibleReplayVersion(56)).toBe(true);
  expect(validateReplay(old)).toBe(true);
  expect(replayBattle(old.initial, 56).nativeBuilderFreeze).toBeUndefined();
  expect(replayBattle(data.initial, 57).nativeBuilderFreeze).toBe(true);
  const viewer = new GameModel();
  expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
  for (const snapshot of [...snapshots].reverse()) {
    viewer.seekReplay(snapshot.at);
    while (viewer.replay!.seeking) viewer.step(0.05);
    expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
  }
  viewer.seekReplay(laterFrozen);
  while (viewer.replay!.seeking) viewer.step(0.05);
  const frozen = viewer.battle!.late!.defendingBuilder!.builders[0];
  const currentCount = frozen.repairCount;
  expect(frozen.freeze).toBeDefined();
  const legacy = new GameModel();
  expect(legacy.openReplay(old)).toBe(true);
  legacy.seekReplay(laterFrozen);
  while (legacy.replay!.seeking) legacy.step(0.05);
  const unfrozen = legacy.battle!.late!.defendingBuilder!.builders[0];
  expect(unfrozen.freeze).toBeUndefined();
  expect(unfrozen.repairCount).toBeGreaterThan(currentCount);
});
