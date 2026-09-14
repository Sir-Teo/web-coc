import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { wizardTowerBattle, wizardTowerVillage } from './fixtures/wizard-tower-battle';
import { validateSave } from '../src/game/save';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { nativeBuildings, nativeCampaignIssues } from '../src/game/native-campaign';
import { seekingMineBattle, seekingMineVillage } from './fixtures/seeking-mine-battle';

it.each([1, 5, 8, 10, 17])(
  'portably reconstructs level %i source flight, complete results and backward seeking',
  (level) => {
    expect(validateSave(wizardTowerVillage(level))).toBe(true);
    const m = wizardTowerBattle(level);
    for (let i = 0; i < 5; i++) m.step(0.05);
    const flight = structuredClone(m.battle!.projectiles);
    expect(flight?.some((p) => p.weapon === 'arcane')).toBe(true);
    for (let i = 0; i < 6000 && !m.battle!.finished; i++) m.step(0.05);
    expect(m.battle!.finished).toBe(true);
    const end = structuredClone(m.battle!);
    const parsed = parseReplayFile(JSON.stringify(makeReplayFile(m.state.raidLog[0].replay!)));
    expect(parsed.version).toBe(47);
    expect(parsed.initial.buildings.find((v) => v.kind === 'wizardtower')?.level).toBe(level);
    const viewer = new GameModel();
    const home = JSON.stringify(viewer.state);
    expect(viewer.openReplay(parsed)).toBe(true);
    const seek = (at: number) => {
      viewer.seekReplay(at);
      while (viewer.replay!.seeking) viewer.step(0.05);
    };
    seek(0.25);
    expect(viewer.battle!.projectiles).toEqual(flight);
    seek(9999);
    for (const key of ['buildings', 'units', 'result', 'projectiles'] as const)
      expect(viewer.battle![key]).toEqual(end[key]);
    seek(0.25);
    expect(viewer.battle!.projectiles).toEqual(flight);
    viewer.returnHome();
    expect(JSON.stringify(viewer.state)).toBe(home);
  },
);

it('retains Graduation Ceremony without bypassing its native dependency or replacing its level-nine towers', () => {
  expect(nativeCampaignIssues(57)).toEqual([]);
  const buildings = nativeBuildings(57);
  expect(buildings).toHaveLength(324);
  expect(buildings.filter((b) => b.kind === 'wizardtower').map((b) => [b.level, b.hp])).toEqual([
    [9, 1600],
    [7, 1200],
    [9, 1600],
    [7, 1200],
  ]);
  const locked = new GameModel();
  locked.startCampaign(57);
  expect(locked.battle).toBeNull();
  // The retained veteran progress supplies the dependency; original entities are untouched.
  const village = seekingMineVillage();
  village.nativeCampaign!.stars[56] = 1;
  const m = seekingMineBattle(57, village);
  for (let i = 0; i < 6000 && !m.battle!.finished; i++) m.step(0.05);
  expect(m.battle!.finished).toBe(true);
  const replay = parseReplayFile(JSON.stringify(makeReplayFile(m.state.raidLog[0].replay!)));
  expect(replay.initial.buildings).toEqual(buildings);
  const viewer = new GameModel();
  expect(viewer.openReplay(replay)).toBe(true);
  viewer.seekReplay(9999);
  while (viewer.replay!.seeking) viewer.step(0.05);
  for (const key of ['buildings', 'units', 'result', 'projectiles'] as const)
    expect(viewer.battle![key]).toEqual(m.battle![key]);
});
