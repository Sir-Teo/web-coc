import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { BattleSoundLog, troopCue, troopSoundCues } from '../src/game/troop-sounds';
import { nativeDirectBattle } from './fixtures/native-direct-attacks';
import { wallBreakerRecording } from './fixtures/attacking-wall-breaker';
import { superWallBreakerRecording } from './fixtures/attacking-super-wall-breaker';
import { nativeTargetingSpellRecording } from './fixtures/native-targeting-spells';

const contacts = (
  battle: ReturnType<typeof nativeDirectBattle>['battle'],
  log = new BattleSoundLog(),
) => troopSoundCues(battle, log).filter((c) => /:attack:|:hit:/.test(c.key));

for (const kind of ['wallbreaker', 'superwallbreaker'] as const)
  for (let level = 1; level <= (kind === 'wallbreaker' ? 14 : 10); level++)
    it(`${kind} ${level} reconstructs its two original contact samples once`, () => {
      const r = nativeDirectBattle(kind, level, 207),
        log = new BattleSoundLog();
      while (!r.unit.attacking) r.step();
      expect(contacts(r.battle)).toEqual([]);
      r.untilAttacks(1);
      const at = r.unit.native!.lastAttackAt!,
        cues = contacts(r.battle);
      expect(cues).toEqual(
        ['attack', 'hit'].map((event) =>
          troopCue(
            r.battle,
            r.unit,
            event as 'attack' | 'hit',
            `troop:${r.unit.id}:${event}:${at}`,
            at,
          ),
        ),
      );
      expect(cues.map((c) => c.sample)).toEqual([
        'troop-wall_breaker_attack_01.ogg',
        'troop-cannon_fire3.ogg',
      ]);
      expect(cues.map((c) => c.volume)).toEqual([0.7, 0.6]);
      expect(cues[0].pitch).toBeGreaterThanOrEqual(0.95);
      expect(cues[0].pitch).toBeLessThanOrEqual(1.05);
      expect(cues[1].pitch).toBeGreaterThanOrEqual(0.9);
      expect(cues[1].pitch).toBeLessThanOrEqual(1.1);
      log.attack(r.battle, r.unit, 'attack', at);
      log.attack(r.battle, r.unit, 'hit', at);
      expect(contacts(r.battle, log)).toEqual(cues);
      const before = JSON.stringify(r.battle);
      expect(contacts(r.battle)).toEqual(cues);
      expect(JSON.stringify(r.battle)).toBe(before);
      r.step();
      expect(contacts(r.battle)).toEqual(cues);
      r.until(at + 10.1);
      expect(contacts(r.battle)).toEqual([]);
    });

for (const kind of ['wallbreaker', 'superwallbreaker'] as const)
  for (const version of [206, 207])
    for (const target of ['storage', 'cannon', 'wall'] as const)
      it(`${kind} ${target} reconstructs complete version ${version} states and contact cues`, () => {
        const record = kind === 'wallbreaker' ? wallBreakerRecording : superWallBreakerRecording,
          r = record(
            version,
            kind === 'wallbreaker' ? 14 : 10,
            target,
            target === 'wall' ? 6.9 : 11.4,
          ),
          viewer = new GameModel();
        expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(
          true,
        );
        for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          viewer.seekReplay(s.at);
          while (viewer.replay!.seeking) viewer.step(0.05);
          expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
          expect(contacts(viewer.battle!)).toEqual(contacts(s.battle));
        }
        expect(contacts(r.snapshots.find((s) => s.at === r.exploded)!.battle)).toHaveLength(
          version === 207 ? 2 : 0,
        );
      });

for (const kind of ['wallbreaker', 'superwallbreaker'] as const)
  for (const target of ['storage', 'cannon', 'wall'] as const)
    it(`${kind} ${target} keeps every physical state unchanged`, () => {
      const record = kind === 'wallbreaker' ? wallBreakerRecording : superWallBreakerRecording,
        level = kind === 'wallbreaker' ? 14 : 10,
        x = target === 'wall' ? 6.9 : 11.4,
        old = record(206, level, target, x),
        current = record(207, level, target, x);
      expect(current.snapshots.map((s) => s.at)).toEqual(old.snapshots.map((s) => s.at));
      for (const [i, s] of current.snapshots.entries()) {
        const physical = structuredClone(s.battle);
        delete physical.nativeWallBreakerSounds;
        expect(physical).toEqual(old.snapshots[i].battle);
      }
    });

for (const kind of ['wallbreaker', 'superwallbreaker'] as const)
  it(`${kind} enables audio only when carried in the new version`, () => {
    const r = nativeDirectBattle(kind);
    expect(replayBattle(r.data.initial, 206).nativeWallBreakerSounds).toBeUndefined();
    expect(replayBattle(r.data.initial, 207).nativeWallBreakerSounds).toBe(true);
    r.data.initial.army[kind] = 0;
    expect(replayBattle(r.data.initial, 207).nativeWallBreakerSounds).toBeUndefined();
  });

for (const kind of ['wallbreaker', 'superwallbreaker'] as const) {
  it(`${kind} killed by a real Cannon before attacking has no contact cues`, () => {
    const record = kind === 'wallbreaker' ? wallBreakerRecording : superWallBreakerRecording,
      r = record(207, 1, 'cannon'),
      dead = r.snapshots.find((s) => s.at === r.defeated)!.battle;
    expect(dead.units.find((u) => u.id === r.id)!.native?.attacks ?? 0).toBe(0);
    expect(contacts(dead)).toEqual([]);
  });
  it(`${kind} version 206 retains its live event log`, () => {
    const r = nativeDirectBattle(kind, 1, 206),
      log = new BattleSoundLog();
    r.untilAttacks(1);
    expect(contacts(r.battle)).toEqual([]);
    log.attack(r.battle, r.unit, 'attack', r.unit.native!.lastAttackAt);
    log.attack(r.battle, r.unit, 'hit', r.unit.native!.lastAttackAt);
    expect(contacts(r.battle, log)).toHaveLength(2);
  });
}

for (const version of [206, 207])
  for (const level of [1, 4])
    it(`actual Angry Spell ${level} cancels ordinary contact audio in version ${version}`, () => {
      const r = nativeTargetingSpellRecording(
          'AngrySpell',
          level,
          version,
          'wallbreaker',
          2.5,
          0.1,
        ),
        viewer = new GameModel();
      expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        viewer.seekReplay(s.at);
        while (viewer.replay!.seeking) viewer.step(0.05);
        expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
        expect(contacts(viewer.battle!)).toEqual([]);
      }
    });
