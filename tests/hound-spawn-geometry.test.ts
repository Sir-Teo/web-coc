import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { houndUnitDirection } from '../src/game/native-hound-geometry';
import { nativeUnitStats } from '../src/game/native-units';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { attackingHoundBattle } from './fixtures/attacking-hound';
import { houndDeathRecording } from './fixtures/hound-death';

it('fixed Horner directions stay within binary64 rounding distance across a full turn', () => {
  let error = 0;
  for (let i = 0; i < 100000; i++) {
    const turn = i / 100000,
      d = houndUnitDirection(turn),
      angle = turn * Math.PI * 2;
    error = Math.max(error, Math.abs(d.x - Math.cos(angle)), Math.abs(d.y - Math.sin(angle)));
  }
  expect(error).toBeLessThan(1e-14);
});

for (const ice of [false, true])
  for (let level = 1; level <= 8; level++)
    it(`${ice ? 'Ice' : 'Lava'} Hound ${level} preserves finite child stock and local disk geometry`, () => {
      const old = attackingHoundBattle(level, 169, 17.6, ice, false),
        current = attackingHoundBattle(level, undefined, 17.6, ice, false);
      for (const r of [old, current]) {
        r.until(0.1);
        r.unit.hp = 0;
        r.step();
      }
      const children = (r) => r.battle.units.filter((u) => u.native?.owner === r.unit.id),
        actual = children(current),
        prior = children(old),
        stats = nativeUnitStats(ice ? 'icehound' : 'lavahound', level);
      expect(actual).toHaveLength(stats.secondaryCount);
      for (let i = 0; i < actual.length; i++) {
        expect(actual[i].id).toBe(prior[i].id);
        expect(actual[i].kind).toBe(prior[i].kind);
        expect(actual[i].level).toBe(prior[i].level);
        expect(actual[i].spawnedAt).toBe(prior[i].spawnedAt);
        const { x: ax, y: ay, ...state } = actual[i],
          { x: px, y: py, ...previous } = prior[i];
        expect(state).toEqual(previous);
        expect(Math.abs(actual[i].x - prior[i].x)).toBeLessThan(1e-13);
        expect(Math.abs(actual[i].y - prior[i].y)).toBeLessThan(1e-13);
        expect(
          Math.sqrt((actual[i].x - current.unit.x) ** 2 + (actual[i].y - current.unit.y) ** 2),
        ).toBeLessThanOrEqual(stats.secondaryDistance + 1e-13);
      }
    });
for (const ice of [false, true])
  for (const version of [169, 170])
    it(`actual ${ice ? 'Ice' : 'Lava'} Monolith defeat replays completely in version ${version}`, () => {
      const r = houndDeathRecording(version, ice),
        m = new GameModel();
      expect(r.children).toHaveLength(
        nativeUnitStats(ice ? 'icehound' : 'lavahound', 8).secondaryCount,
      );
      expect(m.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        m.seekReplay(snapshot.at);
        while (m.replay!.seeking) m.step(0.05);
        expect(JSON.parse(JSON.stringify(m.battle))).toEqual(snapshot.battle);
      }
    });
it('new geometry is allocated only for carried Hound parents after its boundary', () => {
  const s = structuredClone(attackingHoundBattle().data.initial);
  expect(replayBattle(s).nativeHoundSpawnGeometry).toBe(true);
  expect(replayBattle(s, 169).nativeHoundSpawnGeometry).toBeUndefined();
  s.army.lavahound = 0;
  expect(replayBattle(s).nativeHoundSpawnGeometry).toBeUndefined();
  s.army.icehound = 1;
  expect(replayBattle(s).nativeHoundSpawnGeometry).toBe(true);
});
