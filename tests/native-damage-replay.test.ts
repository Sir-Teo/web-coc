import { expect, it } from 'vitest';
import { GameModel, type Battle } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { garrisonTomeRecording } from './fixtures/garrison-tome';
import { nativeRevengeDeckRecording } from './fixtures/native-revenge-deck';

it('an actual Eternal Tome protects against released Clan Castle attacks and damage resumes after expiry', () => {
  const r = garrisonTomeRecording(),
    at = (time: number) => r.snapshots.find((snapshot) => snapshot.at === time)!.battle as Battle;
  const primed = at(r.primed),
    protectedBattle = at(r.protected),
    warden = protectedBattle.units.find((unit) => unit.id === r.unitId)!;
  const dragon = protectedBattle.defenders!.find((defender) => defender.kind === 'dragon')!;
  expect('attackCount' in dragon && dragon.attackCount).toBeGreaterThan(0);
  expect(warden.native!.effects!.shield!.until).toBeGreaterThan(protectedBattle.elapsed);
  expect(warden.hp).toBe(primed.units.find((unit) => unit.id === r.unitId)!.hp);
  expect(at(r.expired).units.find((unit) => unit.id === r.unitId)!.hp).toBeLessThan(warden.hp);
  const old = garrisonTomeRecording(142),
    previous = (
      old.snapshots.find((snapshot) => snapshot.at === old.protected)!.battle as Battle
    ).units.find((unit) => unit.id === old.unitId)!;
  expect(previous.hp).toBeLessThan(warden.hp);
});

it('two actual Archer Towers receive two independent captured counter cards', () => {
  const r = nativeRevengeDeckRecording(),
    flight = r.snapshots.find((snapshot) => snapshot.at === r.flight)!.battle as Battle;
  expect(
    flight
      .projectiles!.filter((shot) => shot.native?.name === 'ddreversalcardprojectile')
      .map((shot) => shot.targetId),
  ).toEqual([2, 3]);
  const old = nativeRevengeDeckRecording(142),
    previous = old.snapshots.find((snapshot) => snapshot.at === old.flight)!.battle as Battle;
  expect(
    previous
      .projectiles!.filter((shot) => shot.native?.name === 'ddreversalcardprojectile')
      .map((shot) => shot.targetId),
  ).toEqual([2]);
});

for (const [name, record] of [
  ['Tome', garrisonTomeRecording],
  ['Revenge Deck', nativeRevengeDeckRecording],
] as const)
  for (const version of [142, 143])
    it(`${name} version ${version} reconstructs complete portable forward and backward snapshots`, () => {
      const r = record(version),
        model = new GameModel();
      expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        model.seekReplay(snapshot.at);
        while (model.replay!.seeking) model.step(0.05);
        expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
      }
    });
