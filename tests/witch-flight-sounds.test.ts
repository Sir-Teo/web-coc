import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import {
  BattleSoundLog,
  troopSoundCues,
  troopCue,
  witchFlightSoundCues,
} from '../src/game/troop-sounds';
import { attackingWitchBattle } from './fixtures/attacking-witch';
import { witchFlightRecording } from './fixtures/witch-flight';

for (const superTroop of [false, true]) {
  const kind = superTroop ? 'superwitch' : 'witch';
  for (let level = 1; level <= 8; level++)
    it(`${kind} ${level} journals actual launch and precise impact once`, () => {
      const r = attackingWitchBattle(level, undefined, 17.6, superTroop);
      r.untilAttacks(1);
      const shot = r.shots[0].shot,
        event = r.battle.nativeWitchShots![0],
        before = JSON.stringify(r.battle);
      expect(event).toEqual({
        id: shot.id,
        sourceId: r.unit.id,
        kind,
        level,
        launched: shot.launched,
      });
      expect(witchFlightSoundCues(r.battle)).toEqual([
        troopCue(
          r.battle,
          { id: r.unit.id, kind, level },
          'attack',
          `troop:${r.unit.id}:attack:${shot.launched}`,
          shot.launched,
        ),
      ]);
      expect(JSON.stringify(r.battle)).toBe(before);
      r.until(shot.impact + 0.05);
      expect(event.hitAt).toBe(shot.impact);
      const cues = witchFlightSoundCues(r.battle).filter(
        (c) =>
          c.key === `troop:${r.unit.id}:attack:${shot.launched}` ||
          c.key === `troop:${r.unit.id}:hit:${shot.impact}`,
      );
      expect(cues).toHaveLength(2);
      expect(cues[1]).toEqual(
        troopCue(
          r.battle,
          { id: r.unit.id, kind, level },
          'hit',
          `troop:${r.unit.id}:hit:${shot.impact}`,
          shot.impact,
        ),
      );
    });
  it(`${kind} journal suppresses duplicate transient launch/impact cues`, () => {
    const r = attackingWitchBattle(1, undefined, 17.6, superTroop);
    r.untilAttacks(1);
    const shot = r.shots[0].shot;
    r.until(shot.impact + 0.05);
    const log = new BattleSoundLog();
    log.attack(r.battle, r.unit, 'attack', shot.launched);
    log.attack(r.battle, r.unit, 'hit', shot.impact);
    const expected = witchFlightSoundCues(r.battle);
    expect(log.cues(r.battle)).toEqual([]);
    expect(
      troopSoundCues(r.battle, log).filter((c) => expected.some((e) => e.key === c.key)),
    ).toEqual(expected);
  });
  it(`${kind} launch and impact tails do not need the caster body`, () => {
    const r = attackingWitchBattle(1, undefined, 17.6, superTroop);
    r.untilAttacks(1);
    const shot = r.shots[0].shot;
    r.unit.hp = 0;
    r.until(shot.impact + 0.05);
    const cues = witchFlightSoundCues(r.battle);
    r.battle.units = [];
    expect(witchFlightSoundCues(r.battle)).toEqual(cues);
    expect(cues).toHaveLength(2);
  });
  it(`${kind} a released projectile can impact during caster Freeze`, () => {
    const r = attackingWitchBattle(1, undefined, 17.6, superTroop);
    r.untilAttacks(1);
    const shot = r.shots[0].shot;
    (r.unit.native!.effects ??= {}).frozenUntil = 100;
    r.until(shot.impact + 0.05);
    expect(r.battle.nativeWitchShots).toHaveLength(1);
    expect(r.battle.nativeWitchShots![0].hitAt).toBe(shot.impact);
    expect(witchFlightSoundCues(r.battle)).toHaveLength(2);
  });
  it(`${kind} ending before landing never invents an impact cue`, () => {
    const r = attackingWitchBattle(1, undefined, 17.6, superTroop);
    r.untilAttacks(1);
    r.model.finishBattle();
    expect(r.battle.nativeWitchShots![0].hitAt).toBeUndefined();
    expect(witchFlightSoundCues(r.battle)).toHaveLength(1);
  });
  it(`${kind} cue history is bounded and expires without new launches`, () => {
    const r = attackingWitchBattle(1, undefined, 17.6, superTroop);
    r.untilAttacks(1);
    const first = r.battle.nativeWitchShots![0].id;
    (r.unit.native!.effects ??= {}).frozenUntil = 100;
    r.until(15);
    expect(r.battle.nativeWitchShots!.some((e) => e.id === first)).toBe(false);
    expect(witchFlightSoundCues(r.battle)).toEqual([]);
  });
  it(`${kind} audio metadata leaves complete version-167 combat exact`, () => {
    const old = attackingWitchBattle(8, 167, 17.6, superTroop),
      current = attackingWitchBattle(8, undefined, 17.6, superTroop);
    for (const at of [0.05, 0.7, 1, 1.35, 2.1, 4.6]) {
      old.until(at);
      current.until(at);
      const actual = JSON.parse(JSON.stringify(current.battle));
      delete actual.nativeWitchSounds;
      delete actual.nativeWitchShots;
      expect(actual).toEqual(JSON.parse(JSON.stringify(old.battle)));
    }
    expect(witchFlightSoundCues(old.battle)).toEqual([]);
  });
  for (const version of [167, 168])
    it(`${kind} actual audio-event recordings replay fully in version ${version}`, () => {
      const r = witchFlightRecording(version, superTroop, 8),
        m = new GameModel();
      expect(m.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        m.seekReplay(snapshot.at);
        while (m.replay!.seeking) m.step(0.05);
        expect(JSON.parse(JSON.stringify(m.battle))).toEqual(snapshot.battle);
        expect(witchFlightSoundCues(m.battle!)).toEqual(witchFlightSoundCues(snapshot.battle));
      }
    });
}
it('only carried Witch families enable the audio journal at its replay boundary', () => {
  const s = structuredClone(attackingWitchBattle().data.initial);
  expect(replayBattle(s).nativeWitchSounds).toBe(true);
  expect(replayBattle(s, 167).nativeWitchSounds).toBeUndefined();
  s.army.witch = 0;
  expect(replayBattle(s).nativeWitchSounds).toBeUndefined();
  s.army.superwitch = 1;
  expect(replayBattle(s).nativeWitchSounds).toBe(true);
});
