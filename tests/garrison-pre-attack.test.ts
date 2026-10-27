import { expect, it } from 'vitest';
import { GameModel, type Battle } from '../src/game/model';
import { isGarrisonDefender, type GarrisonDefender } from '../src/game/defenders';
import { nativeGarrisonSoundCues, garrisonSoundEffects } from '../src/game/garrison-native-sounds';
import { effectCue } from '../src/game/troop-sounds';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { replayBattle } from '../src/game/replay';
import { stepGarrisonPreAttack } from '../src/game/garrison-pre-attack';
import { garrisonPreAttackRecording } from './fixtures/garrison-pre-attack';

const defender = (b: Battle) =>
  b.defenders!.find(
    (d) => isGarrisonDefender(d) && d.kind === 'electrodragon',
  )! as GarrisonDefender;
const chargeCues = (b: Battle) =>
  nativeGarrisonSoundCues(b, defender(b)).filter((c) => c.key.includes(':preAttack:'));
for (const withFreeze of [false, true]) {
  it(`original garrison charge cues follow active time and stop at release, Freeze=${withFreeze}`, () => {
    const r = garrisonPreAttackRecording(undefined, withFreeze),
      at = (time: number) => r.snapshots.find((s) => s.at === time)!.battle;
    for (const time of [r.charging, r.charged, r.nextCharge, ...(withFreeze ? [r.resumed!] : [])]) {
      const b = at(time),
        d = defender(b),
        before = JSON.stringify(b),
        charge = d.preAttack!;
      expect(charge).toBeDefined();
      expect(chargeCues(b)).toEqual([
        effectCue(
          'Electro Dragon Pre Attack',
          `garrison:${d.id}:preAttack:${charge.n}:${charge.targetId}`,
          time - charge.age,
        ),
      ]);
      expect(chargeCues(b)[0]).toMatchObject({ volume: 0.5, pitch: 1 });
      expect(JSON.stringify(b)).toBe(before);
    }
    expect(chargeCues(at(r.first))).toEqual([]);
    expect(chargeCues(at(r.second))).toEqual([]);
    if (withFreeze) {
      expect(chargeCues(at(r.frozen!))).toEqual([]);
      expect(chargeCues(at(r.held!))).toEqual([]);
      expect(defender(at(r.held!)).preAttack!.age).toBe(defender(at(r.frozen!)).preAttack!.age);
      expect(
        defender(at(r.resumed!)).preAttack!.age - defender(at(r.held!)).preAttack!.age,
      ).toBeCloseTo(0.05, 7);
    }
  });
  it(`charge-only metadata preserves exact version-153 combat, Freeze=${withFreeze}`, () => {
    const r = garrisonPreAttackRecording(154, withFreeze),
      old = garrisonPreAttackRecording(153, withFreeze);
    expect(r.snapshots.map((s) => s.at)).toEqual(old.snapshots.map((s) => s.at));
    for (const [index, snapshot] of r.snapshots.entries()) {
      const b = structuredClone(snapshot.battle);
      delete b.nativeGarrisonPreAttack;
      for (const d of b.defenders ?? []) if (isGarrisonDefender(d)) delete d.preAttack;
      expect(b).toEqual(old.snapshots[index].battle);
    }
  });
  for (const version of [153, 154])
    it(`full version-${version} portable charge clocks reverse exactly, Freeze=${withFreeze}`, () => {
      const r = garrisonPreAttackRecording(version, withFreeze),
        model = new GameModel();
      expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        model.seekReplay(snapshot.at);
        while (model.replay!.seeking) model.step(0.05);
        expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
      }
    });
}
it('the warm reserve includes the charge effect only at its version boundary', () => {
  const r = garrisonPreAttackRecording(),
    s = structuredClone(r.data.initial);
  expect(garrisonSoundEffects(replayBattle(s))).toContain('Electro Dragon Pre Attack');
  expect(garrisonSoundEffects(replayBattle(s, 153))).not.toContain('Electro Dragon Pre Attack');
  expect(replayBattle(s).nativeGarrisonPreAttack).toBe(true);
  s.garrisons![0].troops = [{ kind: 'bowler', level: 4, count: 1 }];
  expect(replayBattle(s).nativeGarrisonPreAttack).toBeUndefined();
});
it('a recovery crossing contributes only its active remainder to audio age, without poison scaling', () => {
  const r = garrisonPreAttackRecording(),
    b = structuredClone(r.snapshots.find((s) => s.at === r.nextCharge)!.battle),
    d = defender(b);
  delete d.preAttack;
  d.recovery = 0;
  stepGarrisonPreAttack(b, d, 0.05, 0.025, 0.01);
  expect(d.preAttack!.age).toBeCloseTo(0.03, 9);
});
