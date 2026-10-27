import { expect, it } from 'vitest';
import { GameModel, type Battle } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { garrisonSoundCues } from '../src/game/garrison-sounds';
import { garrisonAudioRecording } from './fixtures/garrison-audio';

for (const kind of ['archer', 'superminion', 'electrodragon', 'royalghost'] as const)
  for (const version of [145, 146])
    it(`actual ${kind} inputs reconstruct complete version-${version} source-audio snapshots`, () => {
      const r = garrisonAudioRecording(kind, version),
        model = new GameModel(),
        at = (time: number) => r.snapshots.find((s) => s.at === time)!.battle as Battle;
      expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      expect(
        garrisonSoundCues(at(r.launched)).some(
          (cue) => cue.key === `garrison:${r.defenderId}:attack:0`,
        ),
      ).toBe(version === 146);
      if (kind === 'electrodragon' && version === 146)
        expect(garrisonSoundCues(at(r.later)).some((cue) => cue.key.includes(':chain:'))).toBe(
          true,
        );
      if (r.dead !== undefined)
        expect(
          garrisonSoundCues(at(r.dead)).some((cue) => cue.key === `garrison:${r.defenderId}:die`),
        ).toBe(version === 146);
      for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        model.seekReplay(snapshot.at);
        while (model.replay!.seeking) model.step(0.05);
        expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
        expect(garrisonSoundCues(model.battle)).toEqual(
          garrisonSoundCues(snapshot.battle as Battle),
        );
      }
    });

for (const kind of ['archer', 'superminion', 'electrodragon', 'royalghost'] as const)
  it(`${kind} source-audio presentation preserves exact version-145 physical combat`, () => {
    const current = garrisonAudioRecording(kind),
      old = garrisonAudioRecording(kind, 145);
    expect(current.snapshots.map((s) => s.at)).toEqual(old.snapshots.map((s) => s.at));
    for (let i = 0; i < current.snapshots.length; i++) {
      const actual = JSON.parse(JSON.stringify(current.snapshots[i].battle));
      delete actual.nativeGarrisonSounds;
      expect(actual).toEqual(old.snapshots[i].battle);
    }
  });
