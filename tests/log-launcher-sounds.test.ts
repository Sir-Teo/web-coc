import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { CUE_HORIZON } from '../src/game/sample-audio';
import {
  BattleSoundLog,
  effectCue,
  troopSoundCues,
  troopSoundEffect,
} from '../src/game/troop-sounds';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { logLauncherBattle, logLauncherRecording } from './fixtures/attacking-log-launcher';

for (const level of [1, 6])
  it(`rolling Log Launcher ${level} retains one original launch cue without a live event log`, () => {
    const r = logLauncherBattle(level, 224);
    r.step();
    const shot = r.battle.nativeRollingLogs![0],
      key = `${shot.id}:attack`,
      expected = effectCue(troopSoundEffect('loglauncher', level, 'attack')!, key, shot.launched),
      before = JSON.stringify(r.battle),
      log = new BattleSoundLog();
    expect(troopSoundCues(r.battle, log).filter((cue) => cue.key === key)).toEqual([expected]);
    expect(JSON.stringify(r.battle)).toBe(before);
    log.attack(r.battle, r.unit, 'attack', shot.launched);
    expect(troopSoundCues(r.battle, log).filter((cue) => cue.sample === expected!.sample)).toEqual([
      expected,
    ]);
    r.battle.units = [];
    expect(troopSoundCues(r.battle, new BattleSoundLog()).find((cue) => cue.key === key)).toEqual(
      expected,
    );
    r.battle.elapsed = shot.launched - 0.01;
    expect(troopSoundCues(r.battle, new BattleSoundLog()).some((cue) => cue.key === key)).toBe(
      false,
    );
    r.battle.elapsed = shot.launched + CUE_HORIZON + 0.01;
    expect(troopSoundCues(r.battle, new BattleSoundLog()).some((cue) => cue.key === key)).toBe(
      false,
    );
  });

it('rolling-log contact cues use physical hit times and suppress duplicate live impacts', () => {
  const r = logLauncherBattle(1, 224);
  r.until(2);
  const shot = r.battle.nativeRollingLogs![0],
    log = new BattleSoundLog();
  for (const hit of shot.hit) log.attack(r.battle, r.unit, 'hit', hit.at);
  const expected = shot.hit.map((hit) =>
    effectCue(
      'Generic Hit',
      `${shot.id}:${hit.target.building ? 'building' : 'defender'}:${hit.target.id}:hit`,
      hit.at,
    ),
  );
  const hits = troopSoundCues(r.battle, log).filter((cue) => cue.key.endsWith(':hit'));
  expect(hits).toEqual(expected);
  expect(hits).toHaveLength(2);
  r.battle.elapsed = shot.hit[0].at - 0.01;
  expect(
    troopSoundCues(r.battle, new BattleSoundLog()).some((cue) => cue.key.endsWith(':hit')),
  ).toBe(false);
});

it('portable backward seeks reconstruct the same launch and contact sound cues read-only', () => {
  const r = logLauncherRecording(6, 224),
    viewer = new GameModel();
  expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
  const heard = new Map<number, unknown>();
  for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
    viewer.seekReplay(snapshot.at);
    while (viewer.replay!.seeking) viewer.step(0.05);
    const before = JSON.stringify(viewer.battle),
      cues = troopSoundCues(viewer.battle!, new BattleSoundLog());
    expect(JSON.stringify(viewer.battle)).toBe(before);
    if (heard.has(snapshot.at)) expect(cues).toEqual(heard.get(snapshot.at));
    else heard.set(snapshot.at, cues);
    if (snapshot.at <= 0.05 + 1e-9)
      expect(cues.some((cue) => cue.key === `log:${r.id}:1:attack`)).toBe(true);
  }
});

it('version 223 keeps the original event-log launch sound', () => {
  const r = logLauncherBattle(1, 223),
    log = new BattleSoundLog();
  r.step();
  log.attack(r.battle, r.unit, 'attack', r.battle.elapsed);
  const key = `troop:${r.unit.id}:attack:${r.battle.elapsed}`;
  expect(troopSoundCues(r.battle, log).filter((cue) => cue.key === key)).toHaveLength(1);
});
