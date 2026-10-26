import { expect, it } from 'vitest';
import { GameModel, type Battle } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { nativeFieldSpellRecording } from './fixtures/native-field-spells';
import { petSummonRecallRecording } from './fixtures/pet-summon-recall';
import { defenderFrostRecording } from './fixtures/defender-frost';
function verify(r: Pick<ReturnType<typeof petSummonRecallRecording>, 'data' | 'snapshots'>) {
  const model = new GameModel();
  for (const version of [r.data.version, 120]) {
    const data = structuredClone(r.data);
    data.version = version;
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      model.seekReplay(snapshot.at);
      while (model.replay!.seeking) model.step(0.05);
      const actual = JSON.parse(JSON.stringify(model.battle)) as Battle,
        expected = JSON.parse(JSON.stringify(snapshot.battle)) as Battle;
      if (version === 120) {
        expect(actual.nativeSpellArt).toEqual([
          'Jump',
          'Rage',
          'Haste',
          'Healing',
          'Poison',
          'Clone',
          'Invisibility',
        ]);
        delete actual.nativeSpellArt;
        delete expected.nativeSpellArt;
        delete actual.nativeSpellCastHistory;
        delete expected.nativeSpellCastHistory;
      }
      expect(actual).toEqual(expected);
    }
  }
}
it.each([1, 7])(
  'Recall level %s reconstructs completed casts through portable reverse seeks',
  (level) => {
    const r = nativeFieldSpellRecording('Recall', level),
      battle = r.snapshots.find((s) => s.at === r.afterLive)!.battle as Battle;
    expect(battle.nativeSpells).toEqual([]);
    expect(battle.nativeSpellCastHistory).toHaveLength(1);
    expect(battle.nativeSpellCastHistory![0]).toMatchObject({
      name: 'Recall',
      level,
      hits: 1,
      ended: true,
    });
    verify(r);
  },
);
it.each([1, 10])(
  'actual Recall and redeployment preserve level-%s pet summon ownership and version-120 physics',
  (level) => {
    const r = petSummonRecallRecording(level),
      battle = r.snapshots.find((s) => s.at === r.recalled)!.battle as Battle;
    expect(battle.nativeSpellCastHistory?.some((c) => c.name === 'Recall' && c.ended)).toBe(true);
    expect(r.petId).not.toBe(r.oldPetId);
    verify(r);
  },
);
it.each([false, true])(
  'Recall preserves committed Queen arrows against air=%s defenders and version-120 physics',
  (air) => {
    const r = defenderFrostRecording(air),
      battle = r.snapshots.find((s) => s.at === r.recalled)!.battle as Battle;
    expect(battle.nativeSpellCastHistory?.some((c) => c.name === 'Recall' && c.ended)).toBe(true);
    expect(r.finalHit).toBeGreaterThan(r.recalled);
    verify(r);
  },
);
