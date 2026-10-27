import { expect, it } from 'vitest';
import { GameModel, type Battle } from '../src/game/model';
import { isGarrisonDefender, type GarrisonDefender } from '../src/game/defenders';
import { nativeGarrisonSoundCues, garrisonSoundEffects } from '../src/game/garrison-native-sounds';
import { effectCue } from '../src/game/troop-sounds';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { replayBattle } from '../src/game/replay';
import { garrisonBowlerAudioRecording } from './fixtures/garrison-bowler-audio';

const defender = (b: Battle) =>
  b.defenders!.find((d) => isGarrisonDefender(d) && d.kind === 'bowler')! as GarrisonDefender;
const cues = (b: Battle) =>
  nativeGarrisonSoundCues(b, defender(b)).filter((c) => c.key.includes(':preAttack:'));
const currentCues = (b: Battle) => {
  const d = defender(b),
    charge = d.preAttack;
  return charge
    ? cues(b).filter((c) => c.key === `garrison:${d.id}:preAttack:${charge.n}:${charge.targetId}`)
    : [];
};
for (const withFreeze of [false, true]) {
  it(`Bowler starts original takes on fresh and repeat windups, Freeze=${withFreeze}`, () => {
    const r = garrisonBowlerAudioRecording(undefined, withFreeze),
      at = (time: number) => r.snapshots.find((s) => s.at === time)!.battle;
    expect(defender(at(r.fresh)).preAttack!.age).toBeCloseTo(1.15, 8);
    const fresh = currentCues(at(r.fresh))[0];
    expect(fresh).toBeDefined();
    const tail = cues(at(r.first)).find((c) => c.key === fresh.key)!;
    expect(tail).toBeDefined();
    expect(tail.at).toBeCloseTo(fresh.at, 8);
    for (const time of [r.charging, r.charged, r.nextCharge, ...(withFreeze ? [r.resumed!] : [])]) {
      const b = at(time),
        d = defender(b),
        before = JSON.stringify(b),
        charge = d.preAttack!;
      const expected = effectCue(
        'trollAttack',
        `garrison:${d.id}:preAttack:${charge.n}:${charge.targetId}`,
        time - charge.age,
      )!;
      expect(currentCues(b)).toEqual([expected]);
      expect(expected.volume).toBe(0.7);
      expect(expected.pitch).toBeGreaterThanOrEqual(0.98);
      expect(expected.pitch).toBeLessThanOrEqual(1.02);
      expect(JSON.stringify(b)).toBe(before);
    }
    expect(defender(at(r.second)).preAttack).toBeUndefined();
    expect(defender(at(r.third)).preAttackHistory).toHaveLength(3);
    expect(new Set(cues(at(r.third)).map((c) => c.key)).size).toBe(cues(at(r.third)).length);
    if (withFreeze) {
      expect(currentCues(at(r.frozen!))).toEqual([]);
      expect(currentCues(at(r.held!))).toEqual([]);
      expect(defender(at(r.frozen!)).preAttack!.age).toBe(defender(at(r.held!)).preAttack!.age);
    }
  });
  it(`Bowler's audio metadata preserves exact version-154 combat, Freeze=${withFreeze}`, () => {
    const r = garrisonBowlerAudioRecording(155, withFreeze),
      old = garrisonBowlerAudioRecording(154, withFreeze);
    expect(r.snapshots.map((s) => s.at)).toEqual(old.snapshots.map((s) => s.at));
    for (const [i, snapshot] of r.snapshots.entries()) {
      const b = structuredClone(snapshot.battle);
      delete b.nativeGarrisonBowlerPreAttack;
      for (const d of b.defenders ?? [])
        if (isGarrisonDefender(d)) {
          delete d.preAttack;
          delete d.preAttackHistory;
        }
      expect(b).toEqual(old.snapshots[i].battle);
    }
  });
  for (const version of [154, 155])
    it(`Bowler's full version-${version} portable snapshots reverse exactly, Freeze=${withFreeze}`, () => {
      const r = garrisonBowlerAudioRecording(version, withFreeze),
        model = new GameModel();
      expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        model.seekReplay(snapshot.at);
        while (model.replay!.seeking) model.step(0.05);
        expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
      }
    });
}
it('mixed historical rosters warm Electro Dragon charge without the new Bowler takes', () => {
  const s = structuredClone(garrisonBowlerAudioRecording().data.initial);
  s.garrisons![0].troops.push({ kind: 'electrodragon', level: 3, count: 1 });
  const old = garrisonSoundEffects(replayBattle(s, 154)),
    current = garrisonSoundEffects(replayBattle(s));
  expect(old).toContain('Electro Dragon Pre Attack');
  expect(old).not.toContain('trollAttack');
  expect(current).toContain('Electro Dragon Pre Attack');
  expect(current).toContain('trollAttack');
  s.garrisons![0].troops = [{ kind: 'electrodragon', level: 3, count: 1 }];
  expect(replayBattle(s).nativeGarrisonBowlerPreAttack).toBeUndefined();
});
