import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import {
  nativeMeteorAngryMerge,
  nativeMeteorThrowRecording,
} from './fixtures/native-meteor-throws';

it.each([
  [1, false],
  [3, true],
] as const)(
  'a real Meteor Golem %s (cloned %s) splits through portable reverse seeks',
  (level, cloned) => {
    const r = nativeMeteorThrowRecording(level, cloned),
      model = new GameModel();
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      model.seekReplay(snapshot.at);
      while (model.replay!.seeking) model.step(0.05);
      expect(model.battle).toEqual(snapshot.battle);
    }
  },
);

it.each([244, 245])(
  'version %i reconstructs Angry Spell through a Meteor Golem throw',
  (version) => {
    const r = nativeMeteorThrowRecording(1, false, { angry: true, version });
    expect(r.stayingAngryUntil).toBeGreaterThan(r.landed);
    if (version >= 245) expect(r.childAngryUntil).toBe(r.stayingAngryUntil);
    else expect(r.childAngryUntil).toBeGreaterThan(r.stayingAngryUntil!);
    const viewer = new GameModel();
    expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const snapshot of [...r.snapshots].reverse()) {
      viewer.seekReplay(snapshot.at);
      while (viewer.replay!.seeking) viewer.step(0.05);
      expect(viewer.battle).toEqual(snapshot.battle);
    }
  },
);

it('preserves the shared Angry deadline through merges only in the new replay rules', () => {
  const legacy = nativeMeteorAngryMerge(245);
  const current = nativeMeteorAngryMerge(246);
  expect(legacy.merged.native?.angryUntil).not.toBe(legacy.deadline);
  expect(current.merged.native?.angryUntil).toBe(current.deadline);
  expect(current.merged.native?.effects?.immortalUntil).toBeCloseTo(current.mergedAt + 1);
});
