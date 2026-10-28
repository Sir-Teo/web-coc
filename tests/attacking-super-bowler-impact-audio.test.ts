import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { hurtUnit } from '../src/game/native-status';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import {
  BattleSoundLog,
  effectCue,
  troopSoundCues,
  troopSoundEffect,
  troopSoundFiles,
} from '../src/game/troop-sounds';
import { nativeDirectBattle } from './fixtures/native-direct-attacks';
import { superBowlerRecording } from './fixtures/attacking-super-bowler';
import { nativeTargetingSpellRecording } from './fixtures/native-targeting-spells';
const cues = (battle: ReturnType<typeof nativeDirectBattle>['battle']) =>
  troopSoundCues(battle, new BattleSoundLog()).filter((c) => c.key.startsWith('superbowler:'));

for (let level = 1; level <= 10; level++)
  it(`Super Bowler ${level} plays two source bounce contacts and one final destruction contact`, () => {
    const r = nativeDirectBattle('superbowler', level, 203, 18.6);
    r.untilAttacks(1);
    expect(cues(r.battle)).toEqual([]);
    while ((r.battle.nativeSuperBowlerImpacts?.length ?? 0) < 3) r.step();
    const history = r.battle.nativeSuperBowlerImpacts!;
    expect(history.map((h) => h.bounce)).toEqual([0, 1, 2]);
    expect(history.every((h) => h.sourceId === r.unit.id && h.level === level)).toBe(true);
    const actual = cues(r.battle);
    expect(actual).toHaveLength(3);
    for (const [i, h] of history.entries()) {
      const event = i < 2 ? 'bounce' : 'projectileHit',
        effect = i < 2 ? 'suptrollBoulder_bounce' : 'trollBoulder_destroyed';
      expect(actual[i]).toEqual(
        effectCue(effect, `superbowler:${h.id}:${h.bounce}:${event}`, h.at),
      );
      expect(actual[i].sample).toBe(
        i < 2 ? 'troop-sup_troll_rb_01.ogg' : 'troop-rock_troll_explo_01.ogg',
      );
      expect(actual[i].volume).toBe(i < 2 ? 0.5 : 0.4);
      expect(actual[i].pitch).toBeGreaterThanOrEqual(i < 2 ? 0.96 : 0.98);
      expect(actual[i].pitch).toBeLessThanOrEqual(i < 2 ? 1.04 : 1.02);
    }
    expect(troopSoundEffect('superbowler', level, 'bounce')).toBe('suptrollBoulder_bounce');
    expect(troopSoundEffect('superbowler', level, 'projectileHit')).toBe('trollBoulder_destroyed');
    expect(troopSoundFiles('superbowler')).toContain('sfx/sup_troll_rb_01.ogg');
    const before = JSON.stringify(r.battle);
    expect(cues(r.battle)).toEqual(actual);
    expect(JSON.stringify(r.battle)).toBe(before);
  });
it('resolved contacts survive caster defeat and retire after the shared sound horizon', () => {
  const r = nativeDirectBattle('superbowler', 1, 203, 18.6);
  r.untilAttacks(1);
  hurtUnit(r.battle, r.unit, r.unit.hp);
  while (r.battle.projectiles?.some((p) => p.sourceId === r.unit.id)) r.step();
  expect(cues(r.battle)).toHaveLength(3);
  expect(r.battle.nativeSuperBowlerImpacts).toHaveLength(3);
  r.until(13);
  expect(cues(r.battle)).toEqual([]);
  expect(r.battle.nativeSuperBowlerImpacts).toEqual([]);
});
for (const version of [202, 203])
  for (const level of [1, 10])
    for (const target of ['storage', 'cannon', 'golem'] as const)
      it(`tier ${level} actual ${target} impact audio reconstructs version ${version} forward and backward`, () => {
        const r = superBowlerRecording(version, level, target),
          viewer = new GameModel();
        expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(
          true,
        );
        const landed = r.snapshots.find((s) => s.at === r.landed)!.battle;
        expect(landed.nativeSuperBowlerImpacts?.length ?? 0).toBe(version === 203 ? 3 : 0);
        for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          viewer.seekReplay(s.at);
          while (viewer.replay!.seeking) viewer.step(0.05);
          expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
          expect(cues(viewer.battle!)).toEqual(cues(s.battle));
        }
      });
for (const level of [1, 10])
  for (const target of ['storage', 'cannon', 'golem'] as const)
    it(`impact metadata preserves every physical tier ${level} ${target} state`, () => {
      const old = superBowlerRecording(202, level, target),
        current = superBowlerRecording(203, level, target);
      expect(current.snapshots.map((s) => s.at)).toEqual(old.snapshots.map((s) => s.at));
      for (const [i, s] of current.snapshots.entries()) {
        const b = JSON.parse(JSON.stringify(s.battle));
        delete b.nativeSuperBowlerImpactSounds;
        delete b.nativeSuperBowlerImpacts;
        expect(b).toEqual(old.snapshots[i].battle);
        expect(cues(old.snapshots[i].battle)).toEqual([]);
      }
    });
for (const level of [1, 4])
  it(`actual Angry Spell ${level} preserves impacts of an already released boulder`, () => {
    const r = nativeTargetingSpellRecording('AngrySpell', level, 203, 'superbowler', 2, 0.1),
      viewer = new GameModel();
    expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    viewer.seekReplay(3.4);
    while (viewer.replay!.seeking) viewer.step(0.05);
    expect(viewer.battle!.units.find((u) => u.id === r.unitId)!.target).toBe(3);
    const history = viewer.battle!.nativeSuperBowlerImpacts!.filter((h) => h.sourceId === r.unitId);
    expect(history.map((h) => h.bounce)).toEqual([0, 1, 2]);
    expect(cues(viewer.battle!)).toHaveLength(3);
  });
it('only a carried Super Bowler enables the version 203 impact journal', () => {
  const r = nativeDirectBattle('superbowler', 1, 203);
  expect(replayBattle(r.data.initial, 202).nativeSuperBowlerImpactSounds).toBeUndefined();
  expect(replayBattle(r.data.initial, 203).nativeSuperBowlerImpactSounds).toBe(true);
  r.data.initial.army.superbowler = 0;
  expect(replayBattle(r.data.initial, 203).nativeSuperBowlerImpactSounds).toBeUndefined();
});
