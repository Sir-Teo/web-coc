import { expect, it } from 'vitest';
import { GameModel, type Battle } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { nativeCloneSpellRecording } from './fixtures/native-clone-spell';
import { nativeInvisibilityRecording } from './fixtures/native-invisibility';
import { nativeFieldSpellRecording } from './fixtures/native-field-spells';
function verify(r: Pick<ReturnType<typeof nativeCloneSpellRecording>, 'data' | 'snapshots'>) {
  const model = new GameModel();
  for (const version of [r.data.version, 119]) {
    const data = structuredClone(r.data);
    data.version = version;
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      model.seekReplay(snapshot.at);
      while (model.replay!.seeking) model.step(0.05);
      const actual = JSON.parse(JSON.stringify(model.battle)) as Battle,
        expected = JSON.parse(JSON.stringify(snapshot.battle)) as Battle;
      if (version === 119) {
        expect(actual.nativeSpellArt).toEqual(['Jump', 'Rage', 'Haste', 'Healing', 'Poison']);
        delete actual.nativeSpellArt;
        delete expected.nativeSpellArt;
        delete expected.nativeRecallPresentation;
        delete expected.nativeRecallEvents;
        delete actual.nativeSpellCastHistory;
        delete expected.nativeSpellCastHistory;
      }
      expect(actual).toEqual(expected);
    }
  }
}
it.each([1, 9])(
  'Clone level %s preserves actual copies, housing and expiration against version 119',
  (level) => {
    const r = nativeCloneSpellRecording(level),
      copied = r.snapshots.find((s) => s.at === r.later)!.battle as Battle;
    expect(copied.nativeSpellCastHistory?.[0]).toMatchObject({ name: 'Clone', level });
    const copies = copied.units.filter((u) => r.copyIds.includes(u.id));
    expect(copies).toHaveLength(level === 1 ? 4 : 9);
    expect(copied.nativeSpellCastHistory![0].budget).toBe(level === 1 ? 2 : 3);
    expect(copies.every((u) => u.summoned && u.native!.cloneUntil! > copied.elapsed)).toBe(true);
    for (const copy of copies)
      expect(copy.native!.cloneUntil! - copy.spawnedAt!).toBeCloseTo(30, 9);
    const expired = r.snapshots.find((s) => s.at === r.expired)!.battle as Battle;
    expect(expired.units.some((u) => u.id === r.originalId && u.hp > 0)).toBe(true);
    expect(expired.units.some((u) => r.copyIds.includes(u.id) && u.hp > 0)).toBe(false);
    verify(r);
  },
);
it.each(['building', 'defender', 'tower'] as const)(
  'Invisibility %s retains target selection and impact physics against version 119',
  (mode) => {
    const r = nativeInvisibilityRecording(mode),
      hidden = r.snapshots.find((s) => s.at === r.hidden)!.battle as Battle;
    expect(hidden.nativeSpellCastHistory?.some((c) => c.name === 'Invisibility') ?? false).toBe(
      mode !== 'tower',
    );
    verify(r);
  },
);
it.each(['Clone', 'Invisibility'] as const)(
  '%s retains ended source field history for portable reverse seeks',
  (name) => {
    const r = nativeFieldSpellRecording(name, name === 'Clone' ? 9 : 4),
      battle = r.snapshots.find((s) => s.at === r.afterLive)!.battle as Battle;
    expect(battle.nativeSpells).toEqual([]);
    expect(battle.nativeSpellCastHistory).toHaveLength(1);
    expect(battle.nativeSpellCastHistory![0]).toMatchObject({ name, ended: true });
    verify(r);
  },
);
