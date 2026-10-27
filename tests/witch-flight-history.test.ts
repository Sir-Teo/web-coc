import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { attackingWitchBattle, attackingWitchRecording } from './fixtures/attacking-witch';
import { witchFlightRecording } from './fixtures/witch-flight';

for (const superTroop of [false, true]) {
  const kind = superTroop ? 'superwitch' : 'witch';
  for (let level = 1; level <= 8; level++)
    it(`${kind} ${level} retains one immutable original flight for its tail`, () => {
      const r = attackingWitchBattle(level, undefined, 17.6, superTroop);
      r.untilAttacks(1);
      const shot = r.shots[0].shot,
        record = r.battle.nativeWitchFlights!.find((p) => p.id === shot.id)!;
      expect(record).toEqual(shot);
      expect(record).not.toBe(r.battle.projectiles!.find((p) => p.id === shot.id));
      expect(record.native).not.toBe(r.battle.projectiles!.find((p) => p.id === shot.id)!.native);
      r.until(shot.impact + 0.1);
      expect(r.battle.projectiles!.some((p) => p.id === shot.id)).toBe(false);
      expect(r.battle.nativeWitchFlights!.find((p) => p.id === shot.id)).toEqual(shot);
      r.until(shot.impact + 3.1);
      expect(r.battle.nativeWitchFlights!.some((p) => p.id === shot.id)).toBe(false);
    });
  it(`${kind} flight art metadata leaves every physical version-166 state exact`, () => {
    const old = attackingWitchBattle(8, 166, 17.6, superTroop),
      current = attackingWitchBattle(8, 167, 17.6, superTroop);
    for (const at of [0.05, 0.7, 0.95, 1.4, 2.1, 4.6]) {
      old.until(at);
      current.until(at);
      const actual = JSON.parse(JSON.stringify(current.battle));
      delete actual.nativeWitchFlightArt;
      delete actual.nativeWitchFlights;
      expect(actual).toEqual(JSON.parse(JSON.stringify(old.battle)));
    }
  });
  it(`${kind} retired flights survive caster defeat and finish without applying damage`, () => {
    const r = attackingWitchBattle(1, undefined, 17.6, superTroop);
    r.untilAttacks(1);
    const shot = r.shots[0].shot;
    r.unit.hp = 0;
    r.until(shot.impact + 0.1);
    expect(r.battle.nativeWitchFlights!.some((p) => p.id === shot.id)).toBe(true);
    const hp = r.battle.buildings.map((b) => b.hp);
    r.model.finishBattle();
    expect(r.battle.projectiles).toEqual([]);
    expect(r.battle.nativeWitchFlights!.some((p) => p.id === shot.id)).toBe(true);
    expect(r.battle.buildings.map((b) => b.hp)).toEqual(hp);
  });
  for (const garrison of ['ground', 'air'] as const)
    it(`${kind} real ${garrison} defender flights retain their complete portable state`, () => {
      const r = attackingWitchRecording(undefined, 17.6, 8, superTroop, garrison),
        m = new GameModel();
      expect(m.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        m.seekReplay(snapshot.at);
        while (m.replay!.seeking) m.step(0.05);
        expect(JSON.parse(JSON.stringify(m.battle))).toEqual(snapshot.battle);
      }
      const released = r.snapshots.find((s) => s.at === r.defenderReleased)!.battle,
        record = released.nativeWitchFlights!.find((p) => p.id === r.defenderShotId)!;
      expect(record.toAir).toBe(garrison === 'air');
      expect(record).toEqual(released.projectiles!.find((p) => p.id === r.defenderShotId));
    });
  for (const version of [166, 167])
    it(`${kind} actual flight/landing/tail inputs replay fully under ${version}`, () => {
      const r = witchFlightRecording(version, superTroop, 8),
        m = new GameModel();
      expect(m.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        m.seekReplay(snapshot.at);
        while (m.replay!.seeking) m.step(0.05);
        expect(JSON.parse(JSON.stringify(m.battle))).toEqual(snapshot.battle);
      }
    });
}
it('Witch flight art is scoped to carried casters and the new replay boundary', () => {
  const s = structuredClone(attackingWitchBattle().data.initial);
  expect(replayBattle(s).nativeWitchFlightArt).toBe(true);
  expect(replayBattle(s, 166).nativeWitchFlightArt).toBeUndefined();
  s.army.witch = 0;
  expect(replayBattle(s).nativeWitchFlightArt).toBeUndefined();
  s.army.superwitch = 1;
  expect(replayBattle(s).nativeWitchFlightArt).toBe(true);
});
