import { expect, it } from 'vitest';
import { GameModel, type Battle } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { replayBattle, REPLAY_VERSION } from '../src/game/replay';
import { emptyArmy } from '../src/game/army';
import { witchRecallBattle, witchRecallRecording } from './fixtures/witch-recall';

for (const kind of ['witch', 'superwitch'] as const) {
  for (const version of [147, 148, REPLAY_VERSION])
    it(`real ${kind} Recall inputs reconstruct full version-${version} portable snapshots`, () => {
      const r = witchRecallRecording(kind, version),
        model = new GameModel(),
        at = (time: number) => r.snapshots.find((s) => s.at === time)!.battle as Battle,
        children = (b: Battle) =>
          b.units.filter((u) => u.kind === (kind === 'witch' ? 'skeleton' : 'bigboy') && u.hp > 0);
      expect(children(at(r.settled))).toHaveLength(
        kind === 'witch' ? (version >= 148 ? 4 : 8) : version >= 148 ? 1 : 2,
      );
      expect(children(at(r.next))).toHaveLength(
        kind === 'witch' ? (version >= 148 ? 6 : 8) : version >= 148 ? 1 : 2,
      );
      if (version >= 148) {
        expect(children(at(r.next)).every((u) => u.native!.owner === r.oldId)).toBe(true);
        const unit = at(r.returned).units.find((u) => u.id === r.newId)!;
        expect(unit.native!.summonerId).toBe(r.oldId);
        expect(unit.native!.summonAt).toBe(r.nextAt);
      }
      expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        model.seekReplay(snapshot.at);
        while (model.replay!.seeking) model.step(0.05);
        expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
      }
    });
  for (const level of [1, 8])
    it(`${kind} ${level} retains exact version-147 combat before Recall`, () => {
      const r = witchRecallBattle(kind, level, 148),
        old = witchRecallBattle(kind, level, 147);
      r.until(3);
      old.until(3);
      const actual = JSON.parse(JSON.stringify(r.battle));
      delete actual.nativeWitchRecall;
      expect(actual).toEqual(JSON.parse(JSON.stringify(old.battle)));
    });
}

it('only carried Witch and Super Witch allocate the Recall adapter', () => {
  const setup = structuredClone(witchRecallBattle('witch').data.initial);
  expect(replayBattle(setup).nativeWitchRecall).toBe(true);
  expect(replayBattle(setup, 147).nativeWitchRecall).toBeUndefined();
  setup.army = { ...emptyArmy(), superwitch: 1 };
  expect(replayBattle(setup).nativeWitchRecall).toBe(true);
  setup.army = { ...emptyArmy(), ruinwitch: 1 };
  expect(replayBattle(setup).nativeWitchRecall).toBeUndefined();
  setup.army = { ...emptyArmy(), giant: 1 };
  expect(replayBattle(setup).nativeWitchRecall).toBeUndefined();
});
