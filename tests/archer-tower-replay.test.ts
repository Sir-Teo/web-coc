import { expect, it } from 'vitest';
import { archerTowerBattle } from './fixtures/archer-tower-battle';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
for (const level of [1, 7, 10, 12, 15, 21])
  it(`reconstructs complete level ${level} tower combat, backward seeks and home isolation`, () => {
    const model = archerTowerBattle(level),
      snapshots = new Map<number, string>();
    let sawTracking = false;
    for (let step = 0; step < 6000 && !model.battle!.finished; step++) {
      if ([1, 6, 11, 39, 70, 100, 200, 500].includes(step))
        snapshots.set(step, JSON.stringify(model.battle));
      sawTracking ||= !!model.battle!.projectiles?.some(
        (p) => p.weapon === 'arrow' && p.variant === level && p.flight,
      );
      model.step(0.05);
    }
    expect(sawTracking).toBe(true);
    expect(model.battle!.finished).toBe(true);
    const final = structuredClone(model.battle);
    const record = parseReplayFile(JSON.stringify(makeReplayFile(model.state.raidLog[0].replay!)));
    expect(record.version).toBe(47);
    model.returnHome();
    const home = JSON.stringify(model.state);
    expect(model.openReplay(record)).toBe(true);
    const seek = (time: number) => {
      model.seekReplay(time);
      while (model.replay!.seeking) model.step(0.05);
      return structuredClone(model.battle);
    };
    for (const [step, snapshot] of [...snapshots].reverse())
      expect(seek(step * 0.05)).toEqual(JSON.parse(snapshot));
    expect(seek(9999)).toEqual(final);
    model.returnHome();
    expect(JSON.stringify(model.state)).toBe(home);
  });
