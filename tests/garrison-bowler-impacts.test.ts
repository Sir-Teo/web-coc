import { expect, it } from 'vitest';
import { GameModel, type Battle } from '../src/game/model';
import { isGarrisonDefender, stepDefenders, type GarrisonDefender } from '../src/game/defenders';
import {
  nativeGarrisonSoundCues,
  garrisonSoundEffects,
  garrisonSoundEffect,
} from '../src/game/garrison-native-sounds';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { replayBattle } from '../src/game/replay';
import { garrisonBowlerImpactRecording } from './fixtures/garrison-bowler-impacts';

const defender = (b: Battle) =>
  b.defenders!.find((d) => isGarrisonDefender(d) && d.kind === 'bowler')! as GarrisonDefender;
const cues = (b: Battle) =>
  nativeGarrisonSoundCues(b, defender(b)).filter(
    (c) => c.key.includes(':bounce:') || c.key.includes(':projectile-hit:'),
  );
it('the defending VisualLevel follows its actual source projectile sound links', () => {
  expect(garrisonSoundEffect('bowler', 4, 'bounce')).toBe('trollBoulder_bounce');
  expect(garrisonSoundEffect('bowler', 4, 'projectileHit')).toBe('trollBoulder_destroyed');
});
for (const mode of ['none', 'freeze', 'lightning'] as const) {
  it(`both resolved garrison boulder phases play once at source settings, mode=${mode}`, () => {
    const r = garrisonBowlerImpactRecording(undefined, mode),
      at = (time: number) => r.snapshots.find((s) => s.at === time)!.battle,
      first = at(r.first),
      hit = at(r.hit),
      shatter = at(r.shatter),
      d = defender(shatter),
      attack = d.attacks[0];
    expect(cues(first)).toEqual([]);
    expect(cues(hit)).toHaveLength(1);
    const actual = cues(shatter);
    expect(actual).toHaveLength(2);
    expect(actual[0]).toMatchObject({
      key: `garrison:${d.id}:bounce:0`,
      sample: 'troop-rock_troll_hit_02.ogg',
      volume: 0.5,
      at: attack.hitAt,
    });
    expect(actual[1]).toMatchObject({
      key: `garrison:${d.id}:projectile-hit:0`,
      sample: 'troop-rock_troll_explo_01.ogg',
      volume: 0.4,
      at: attack.bounceAt,
    });
    expect(actual[0].pitch).toBeGreaterThanOrEqual(0.96);
    expect(actual[0].pitch).toBeLessThanOrEqual(1.04);
    expect(actual[1].pitch).toBeGreaterThanOrEqual(0.98);
    expect(actual[1].pitch).toBeLessThanOrEqual(1.02);
    expect(attack.bounceAt!).toBeGreaterThan(attack.hitAt!);
    if (mode === 'freeze') expect(d.frozenUntil!).toBeGreaterThan(shatter.elapsed);
    if (mode === 'lightning') expect(d.hp).toBe(0);
    const before = JSON.stringify(shatter);
    expect(cues(shatter)).toEqual(actual);
    expect(JSON.stringify(shatter)).toBe(before);
    expect(cues(at(r.tail))).toEqual(actual);
  });
  it(`garrison impact binding preserves every version-159 physical field, mode=${mode}`, () => {
    const old = garrisonBowlerImpactRecording(159, mode),
      r = garrisonBowlerImpactRecording(160, mode);
    expect(r.snapshots.map((s) => s.at)).toEqual(old.snapshots.map((s) => s.at));
    for (const [i, snapshot] of r.snapshots.entries()) {
      const b = structuredClone(snapshot.battle);
      delete b.nativeGarrisonBowlerImpacts;
      expect(b).toEqual(old.snapshots[i].battle);
      expect(cues(old.snapshots[i].battle)).toEqual([]);
    }
  });
  for (const version of [159, 160])
    it(`full version-${version} impact snapshots reverse through ${mode}`, () => {
      const r = garrisonBowlerImpactRecording(version, mode),
        model = new GameModel();
      expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        model.seekReplay(snapshot.at);
        while (model.replay!.seeking) model.step(0.05);
        expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
        expect(cues(model.battle!)).toEqual(cues(snapshot.battle));
      }
    });
}
it('a boulder still sounds its ground contact when the primary target has already fallen', () => {
  const r = garrisonBowlerImpactRecording(),
    b = structuredClone(r.snapshots.find((s) => s.at === r.first)!.battle),
    d = defender(b),
    attack = d.attacks[0];
  for (const u of b.units) u.hp = 0;
  while (attack.bounceAt === undefined) {
    b.elapsed += 0.05;
    stepDefenders(b, 0.05, () => {});
  }
  expect(attack.hit).toBe(false);
  expect(cues(b)).toHaveLength(2);
});
it('future and spent impact records stay silent without mutating retained history', () => {
  const r = garrisonBowlerImpactRecording(),
    b = structuredClone(r.snapshots.find((s) => s.at === r.shatter)!.battle),
    d = defender(b),
    attack = d.attacks[0];
  b.elapsed = attack.hitAt! - 0.001;
  expect(cues(b)).toEqual([]);
  b.elapsed = attack.bounceAt! + 10;
  const before = JSON.stringify(b);
  expect(cues(b)).toEqual([]);
  expect(JSON.stringify(b)).toBe(before);
});
it('only enabled Bowler reserves warm their new impact effects', () => {
  const s = structuredClone(garrisonBowlerImpactRecording().data.initial),
    old = replayBattle(s, 159),
    current = replayBattle(s);
  expect(current.nativeGarrisonBowlerImpacts).toBe(true);
  expect(old.nativeGarrisonBowlerImpacts).toBeUndefined();
  for (const effect of ['trollBoulder_bounce', 'trollBoulder_destroyed']) {
    expect(garrisonSoundEffects(old)).not.toContain(effect);
    expect(garrisonSoundEffects(current)).toContain(effect);
  }
  s.garrisons![0].troops = [{ kind: 'golem', level: 8, count: 1 }];
  expect(replayBattle(s).nativeGarrisonBowlerImpacts).toBeUndefined();
});
