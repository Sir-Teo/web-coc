import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { REPLAY_VERSION } from '../src/game/replay';
import { attackingWitchBattle } from './fixtures/attacking-witch';

for (const level of [1, 8])
  for (const [version, interval] of [
    [252, 7.875],
    [REPLAY_VERSION, 7],
  ] as const)
    it(`Witch level ${level} respects its wave interval and cap in rules ${version}`, () => {
      const r = attackingWitchBattle(level, version);
      const children = (m: GameModel) =>
        m
          .battle!.units.filter(
            (u) => u.kind === 'skeleton' && u.hp > 0 && (u.spawnedAt ?? 0) <= m.battle!.elapsed,
          )
          .map(({ spawnedAt, level }) => ({ spawnedAt, level }));
      const count = level === 1 ? 4 : 5;
      const limit = level === 1 ? 6 : 16;
      while (!r.battle.units.some((unit) => unit.kind === 'skeleton')) r.step();
      const firstAt = r.battle.units.find((unit) => unit.kind === 'skeleton')!.spawnedAt!;
      const checkpoints = [];
      const verify = (time: number, waves: number) => {
        r.until(time);
        const wave = children(r.model);
        expect(wave).toHaveLength(Math.min(waves * count, limit));
        for (const [i, unit] of wave.entries()) {
          expect(unit.spawnedAt).toBeCloseTo(firstAt + Math.floor(i / count) * interval, 8);
          expect(unit.level).toBe(level === 1 ? 1 : 2);
        }
        checkpoints.push({ at: r.battle.elapsed, wave });
      };
      verify(firstAt + 0.05, 1);
      verify(firstAt + interval - 0.1, 1);
      verify(firstAt + interval + 0.05, 2);
      verify(firstAt + interval * 3 + 0.05, 4);
      r.step();
      r.model.finishBattle();
      const viewer = new GameModel();
      expect(viewer.openReplay(r.model.state.raidLog![0].replay!)).toBe(true);
      for (const { at, wave } of checkpoints.slice().reverse()) {
        viewer.seekReplay(at);
        while (viewer.replay!.seeking) viewer.step(0.05);
        expect(children(viewer)).toEqual(wave);
      }
    });
