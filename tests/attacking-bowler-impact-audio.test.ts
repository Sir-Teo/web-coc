import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { replayBattle } from '../src/game/replay';
import {
  BattleSoundLog,
  troopSoundCues,
  troopSoundEffect,
  troopSoundFiles,
} from '../src/game/troop-sounds';
import { attackingBowlerBattle } from './fixtures/attacking-bowler';
import { bowlerBouldersRecording } from './fixtures/bowler-boulders';

const cues = (battle: ReturnType<typeof attackingBowlerBattle>['battle']) =>
  troopSoundCues(battle, new BattleSoundLog()).filter((c) => c.key.startsWith('bowler:'));

for (let level = 1; level <= 10; level++)
  it(`Bowler ${level} binds distinct source bounce/shatter effects at resolved clocks`, () => {
    const r = attackingBowlerBattle(level);
    r.untilAttacks(1);
    const shot = r.battle.projectiles!.find((p) => p.native?.kind === 'bowler')!;
    expect(cues(r.battle)).toEqual([]);
    while (r.battle.projectiles!.some((p) => p.id === shot.id)) r.step();
    const bounce = r.battle.projectiles!.find((p) => p.native?.bounce === 1)!;
    expect(r.battle.nativeBowlerImpacts).toEqual([
      { id: shot.id, sourceId: r.unit.id, level, bounce: 0, at: shot.impact },
    ]);
    expect(troopSoundEffect('bowler', level, 'bounce')).toBe('trollBoulder_bounce');
    expect(troopSoundEffect('bowler', level, 'projectileHit')).toBe(
      level < 8 ? 'trollBoulder_destroyed' : 'trollBoulder_destroyed_lvl8',
    );
    while (r.battle.projectiles!.some((p) => p.id === bounce.id)) r.step();
    const before = JSON.stringify(r.battle),
      actual = cues(r.battle);
    expect(actual).toHaveLength(2);
    expect(actual[0]).toMatchObject({
      key: `bowler:${shot.id}:bounce`,
      sample: 'troop-rock_troll_hit_02.ogg',
      at: shot.impact,
      volume: 0.5,
    });
    expect(actual[1]).toMatchObject({
      key: `bowler:${bounce.id}:projectileHit`,
      sample: 'troop-rock_troll_explo_01.ogg',
      at: bounce.impact,
      volume: 0.4,
    });
    expect(actual[0].pitch).toBeGreaterThanOrEqual(0.96);
    expect(actual[0].pitch).toBeLessThanOrEqual(1.04);
    expect(actual[1].pitch).toBeGreaterThanOrEqual(0.98);
    expect(actual[1].pitch).toBeLessThanOrEqual(1.02);
    expect(cues(r.battle)).toEqual(actual);
    expect(JSON.stringify(r.battle)).toBe(before);
  });

it('released boulder sound tails survive the thrower and retire after the shared horizon', () => {
  const r = attackingBowlerBattle();
  r.untilAttacks(1);
  r.unit.hp = 0;
  while (r.battle.projectiles!.some((p) => p.sourceId === r.unit.id)) r.step();
  expect(cues(r.battle)).toHaveLength(2);
  expect(r.battle.nativeBowlerImpacts).toHaveLength(2);
  r.until(12);
  expect(cues(r.battle)).toEqual([]);
  expect(r.battle.nativeBowlerImpacts).toEqual([]);
});

it('audio-only metadata preserves exact version-157 combat snapshots', () => {
  const old = bowlerBouldersRecording(157),
    current = bowlerBouldersRecording(158);
  expect(current.snapshots.map((s) => s.at)).toEqual(old.snapshots.map((s) => s.at));
  for (const [i, snapshot] of current.snapshots.entries()) {
    const b = structuredClone(snapshot.battle);
    delete b.nativeBowlerImpactSounds;
    delete b.nativeBowlerImpacts;
    expect(b).toEqual(old.snapshots[i].battle);
    expect(cues(old.snapshots[i].battle)).toEqual([]);
  }
});

for (const version of [157, 158])
  it(`version-${version} impact clocks and full portable snapshots seek both directions`, () => {
    const r = bowlerBouldersRecording(version),
      model = new GameModel();
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      model.seekReplay(snapshot.at);
      while (model.replay!.seeking) model.step(0.05);
      expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
      expect(cues(model.battle!)).toEqual(cues(snapshot.battle));
    }
  });

it('historical player Bowler armies keep their previous sound preload list', () => {
  expect(troopSoundFiles('bowler', false)).not.toContain('sfx/rock_troll_hit_02.ogg');
  expect(troopSoundFiles('bowler', false)).not.toContain('sfx/rock_troll_explo_01.ogg');
  expect(troopSoundFiles('bowler')).toContain('sfx/rock_troll_hit_02.ogg');
  expect(troopSoundFiles('bowler')).toContain('sfx/rock_troll_explo_01.ogg');
  const s = structuredClone(attackingBowlerBattle().data.initial);
  expect(replayBattle(s).nativeBowlerImpactSounds).toBe(true);
  expect(replayBattle(s, 157).nativeBowlerImpactSounds).toBeUndefined();
  s.army.bowler = 0;
  expect(replayBattle(s).nativeBowlerImpactSounds).toBeUndefined();
});
