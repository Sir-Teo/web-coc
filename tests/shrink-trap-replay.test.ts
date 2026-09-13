import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { shrinkTrapVillage, shrinkTrapBattle } from './fixtures/shrink-trap-battle';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { validateSave } from '../src/game/save';
import { nativeBuildings } from '../src/game/native-campaign';

it('reconstructs every Magic Practice trap and status across portable playback and backward seeks', () => {
  expect(validateSave(shrinkTrapVillage())).toBe(true);
  const m = shrinkTrapBattle();
  const snapshots = new Map<number, string>();
  for (let i = 0; i < 4000 && !m.battle!.finished; i++) {
    if ([0, 1, 10, 39, 80, 400, 420, 550].includes(i)) snapshots.set(i, JSON.stringify(m.battle));
    m.step(0.05);
  }
  expect(m.battle!.finished).toBe(true);
  // Version 44 native battles route P.E.K.K.As through client sub-tile building lanes;
  // this fixed army reaches 19% (42% on the former whole-tile grid).
  expect(m.battle!.result!.destruction).toBe(19);
  expect(
    Object.values(m.battle!.traps)
      .filter((s) => s.shrink)
      .map((s) => s.shrink!.pulses),
  ).toEqual([75, 75, 75]);
  expect(m.battle!.units.some((u) => u.shrink && u.shrink.timeLost > 0)).toBe(true);
  const end = JSON.stringify(m.battle),
    file = makeReplayFile(m.state.raidLog[0].replay!);
  const data = parseReplayFile(JSON.stringify(file));
  expect(data.initial.buildings).toEqual(nativeBuildings(54));
  expect(validateSave(m.state)).toBe(true);
  m.returnHome();
  const home = JSON.stringify(m.state);
  m.openReplay(data);
  const seek = (at: number) => {
    m.seekReplay(at);
    while (m.replay!.seeking) m.step(0.05);
    return JSON.stringify(m.battle);
  };
  for (const [step, snapshot] of snapshots) {
    const at = data.steps.slice(0, step).reduce((a, b) => a + b, 0);
    expect(JSON.parse(seek(at))).toEqual(JSON.parse(snapshot));
    seek(0);
    expect(JSON.parse(seek(at))).toEqual(JSON.parse(snapshot));
  }
  expect(JSON.parse(seek(9999))).toEqual(JSON.parse(end));
  m.returnHome();
  expect(JSON.stringify(m.state)).toBe(home);
});

it('keeps the original prerequisite and does not allow repeat raids to refill the treasury', () => {
  const locked = new GameModel();
  locked.startCampaign(54);
  expect(locked.battle).toBeNull();
  const m = shrinkTrapBattle();
  for (let i = 0; i < 4000 && !m.battle!.finished; i++) m.step(0.05);
  const remaining = structuredClone(m.state.nativeCampaign!.remaining[54]);
  m.returnHome();
  m.state.army = { ...shrinkTrapVillage().army };
  m.startCampaign(54);
  expect(m.battle!.availableLoot).toEqual(remaining);
});
