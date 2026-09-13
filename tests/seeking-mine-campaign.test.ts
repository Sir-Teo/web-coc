import { expect, it } from 'vitest';
import { seekingMineBattle, seekingMineVillage } from './fixtures/seeking-mine-battle';
import { GameModel } from '../src/game/model';
import { NATIVE_CAMPAIGN, nativeBuildings } from '../src/game/native-campaign';
import { validateSave } from '../src/game/save';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

it.each([51, 52, 53])(
  'resolves and portably replays the original mine flight in native village %i',
  (index) => {
    expect(validateSave(seekingMineVillage())).toBe(true);
    const m = seekingMineBattle(index);
    const mines = m.battle!.buildings.filter((b) => b.kind === 'seekingairmine');
    let flightAt = 0;
    for (let i = 0; i < 6000 && !m.battle!.finished; i++) {
      m.step(0.05);
      if (
        !flightAt &&
        mines.some((mine) => {
          const state = m.battle!.traps[mine.id];
          return (
            state &&
            !state.resolved &&
            Math.hypot(state.x - mine.x - 0.5, state.y - mine.y - 0.5) > 0.1
          );
        })
      )
        flightAt = m.battle!.elapsed;
    }
    expect(m.battle!.finished, NATIVE_CAMPAIGN[index].name).toBe(true);
    expect(flightAt).toBeGreaterThan(0);
    expect(mines.some((mine) => m.battle!.traps[mine.id]?.resolved)).toBe(true);
    const end = structuredClone(m.battle!);
    const parsed = parseReplayFile(JSON.stringify(makeReplayFile(m.state.raidLog[0].replay!)));
    expect(parsed.initial.buildings).toEqual(nativeBuildings(index));
    expect(parsed.version).toBe(40);
    const viewer = new GameModel();
    const home = JSON.stringify(viewer.state);
    expect(viewer.openReplay(parsed)).toBe(true);
    viewer.seekReplay(flightAt);
    while (viewer.replay!.seeking) viewer.step(0.05);
    const flight = structuredClone(viewer.battle!.traps);
    viewer.seekReplay(9999);
    while (viewer.replay!.seeking) viewer.step(0.05);
    for (const key of ['buildings', 'traps', 'units', 'result'] as const)
      expect(viewer.battle![key]).toEqual(end[key]);
    viewer.seekReplay(flightAt);
    while (viewer.replay!.seeking) viewer.step(0.05);
    expect(viewer.battle!.traps).toEqual(flight);
    viewer.returnHome();
    expect(JSON.stringify(viewer.state)).toBe(home);
  },
);
