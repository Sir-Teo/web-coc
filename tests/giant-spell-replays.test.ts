import { expect, it } from 'vitest';
import { GameModel, type Battle } from '../src/game/model';
import { REPLAY_VERSION } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { nativeCloneSpellRecording } from './fixtures/native-clone-spell';
import { nativeHealingSpellRecording } from './fixtures/native-healing-spell';
import { nativeRecallUnitRecording } from './fixtures/native-recall-unit';
import { nativeIceBlockRecording } from './fixtures/native-iceblock';
import { heroAuraRevivalRecording } from './fixtures/hero-aura-revival';

/** Historical spell comparisons stay at their own rule boundary; these use today's Giants. */
for (const [name, record] of [
  ['Clone 1', () => nativeCloneSpellRecording(1)],
  ['Clone 9', () => nativeCloneSpellRecording(9)],
  ['Healing 1', () => nativeHealingSpellRecording(1)],
  ['Healing 12', () => nativeHealingSpellRecording(12)],
  ['Recall immediately', () => nativeRecallUnitRecording(0)],
  ['Recall after 11 seconds', () => nativeRecallUnitRecording(11)],
  ['Ice Block 1', () => nativeIceBlockRecording(1)],
  ['Ice Block 6', () => nativeIceBlockRecording(6)],
  ...(['electro-boots', 'rage-gem', 'life-gem'] as const).flatMap((item) =>
    (['revive', 'phoenix'] as const).map(
      (revival) =>
        [`${item} after ${revival}`, () => heroAuraRevivalRecording(item, revival)] as const,
    ),
  ),
] as const)
  it(`current Giant rules replay ${name} through complete forward and reverse snapshots`, () => {
    const r = record(),
      model = new GameModel();
    expect(r.data.version).toBe(REPLAY_VERSION);
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      model.seekReplay(snapshot.at);
      while (model.replay!.seeking) model.step(0.05);
      expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
      expect((snapshot.battle as Battle).nativeGiantWindup).toBe(true);
    }
  });
