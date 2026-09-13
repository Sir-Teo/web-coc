import { expect, it } from 'vitest';
import {
  NATIVE_CAMPAIGN,
  nativeCampaignIssues,
  nativeBuildings,
} from '../src/game/native-campaign';
import { GameModel } from '../src/game/model';
import { BUILDINGS } from '../src/game/data';
import { darkDrillStats } from '../src/game/dark-drill-stats';
import { validateSave } from '../src/game/save';
import { validateReplay } from '../src/game/replay';

it('adapts all captured Drill tiers without expanding home progression', () => {
  const stage = NATIVE_CAMPAIGN[0],
    original = stage.buildings;
  try {
    for (let level = 1; level <= 11; level++) {
      stage.buildings = [[1000023, 10, 10, level]];
      expect(nativeCampaignIssues(0)).toEqual([]);
      expect(nativeBuildings(0)[0]).toMatchObject({
        kind: 'darkdrill',
        x: 12,
        y: 12,
        level,
        hp: darkDrillStats(level).hp,
        maxHp: darkDrillStats(level).hp,
      });
      const m = new GameModel();
      m.startCampaign(0);
      m.deploy(1, 1);
      m.step(0.05);
      m.finishBattle();
      const replay = m.state.raidLog![0].replay!;
      expect(replay).toBeDefined();
      expect(validateReplay(JSON.parse(JSON.stringify(replay)))).toBe(true);
      expect(validateReplay({ ...replay, version: 39 })).toBe(level <= 3);
      expect(validateSave(JSON.parse(JSON.stringify(m.state)))).toBe(true);
      const viewer = new GameModel();
      expect(viewer.openReplay(JSON.parse(JSON.stringify(replay)))).toBe(true);
      expect(viewer.battle!.buildings[0]).toMatchObject({
        kind: 'darkdrill',
        level,
        hp: darkDrillStats(level).hp,
      });
      const malformed = structuredClone(replay);
      malformed.initial.buildings[0].level = 12;
      expect(validateReplay(malformed)).toBe(false);
    }
    stage.buildings = [[1000023, 10, 10, 12]];
    expect(nativeCampaignIssues(0)).toContain('Dark Elixir Drill level 12');
    expect(() => nativeBuildings(0)).toThrow();
  } finally {
    stage.buildings = original;
  }
  expect(BUILDINGS.darkdrill.maxLevel).toBe(3);
});
it('admits Midnight Oil with its resolved Drill and defenses', () => {
  expect(nativeCampaignIssues(58)).not.toContain('Dark Elixir Drill');
  expect(nativeCampaignIssues(58)).toEqual([]);
  expect(nativeCampaignIssues(58)).not.toContain('Archer Tower level 15');
  expect(nativeBuildings(58).filter((b) => b.kind === 'inferno')).toHaveLength(4);
});
