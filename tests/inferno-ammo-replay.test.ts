import { expect, it } from 'vitest';
import { infernoBattle } from './fixtures/inferno-battle';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
for (const [level, mode] of [
  [1, 'single'],
  [8, 'multi'],
  [12, 'single'],
] as const)
  it(`reconstructs complete ${mode} level ${level} Inferno combat, backward seeks and home isolation`, () => {
    const model = infernoBattle(level, mode),
      snapshots = new Map<number, string>();
    let sawConsumption = false;
    for (let step = 0; step < 6000 && !model.battle!.finished; step++) {
      if ([1, 6, 11, 39, 70, 100, 200, 500].includes(step))
        snapshots.set(step, JSON.stringify(model.battle));
      sawConsumption ||= Object.values(model.battle!.infernos ?? {}).some(
        (s) => s.ammunition !== undefined && s.ammunition < 1000,
      );
      model.step(0.05);
    }
    expect(sawConsumption).toBe(true);
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
for (const ammo of [0, 1])
  it(`reconstructs a portable replay with ${ammo} initial ammunition across backward seeks`, () => {
    const model = infernoBattle(8, 'multi');
    while (!model.battle!.finished) model.step(0.05);
    const data = structuredClone(model.state.raidLog[0].replay!);
    data.initial.buildings.find((b) => b.kind === 'inferno')!.infernoAmmo = ammo;
    const record = parseReplayFile(JSON.stringify(makeReplayFile(data)));
    model.returnHome();
    const home = JSON.stringify(model.state);
    expect(model.openReplay(record)).toBe(true);
    const seek = (time: number) => {
      model.seekReplay(time);
      while (model.replay!.seeking) model.step(0.05);
      return JSON.stringify(model.battle);
    };
    const snapshots = [0, 0.05, 0.2, 1, 5, 15].map((t) => [t, seek(t)] as const);
    expect(model.battle!.infernos![6].ammunition).toBe(0);
    expect(model.battle!.infernos![6].scheduler.slots.every((s) => s.targetId === null)).toBe(true);
    for (const [time, state] of snapshots.reverse()) expect(seek(time)).toBe(state);
    model.returnHome();
    expect(JSON.stringify(model.state)).toBe(home);
  });
