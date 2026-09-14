import { expect, it } from 'vitest';
import {
  NATIVE_CAMPAIGN,
  nativeCampaignIssues,
  nativeBuildings,
} from '../src/game/native-campaign';
import { GameModel } from '../src/game/model';
import { BUILDINGS } from '../src/game/data';
import { archerTowerStats } from '../src/game/archer-tower-stats';
import { validateSave } from '../src/game/save';
import { validateReplay } from '../src/game/replay';

it('adapts all captured Archer Tower tiers alongside home progression', () => {
  const stage = NATIVE_CAMPAIGN[0],
    original = stage.buildings;
  try {
    for (let level = 1; level <= 21; level++) {
      stage.buildings = [[1000009, 10, 10, level]];
      expect(nativeCampaignIssues(0)).toEqual([]);
      expect(nativeBuildings(0)[0]).toMatchObject({
        kind: 'archertower',
        x: 12,
        y: 12,
        level,
        hp: archerTowerStats(level).hp,
        maxHp: archerTowerStats(level).hp,
      });
      const m = new GameModel();
      m.startCampaign(0);
      m.deploy(1, 1);
      m.step(0.05);
      m.finishBattle();
      const replay = m.state.raidLog![0].replay!;
      expect(replay).toBeDefined();
      expect(validateReplay(JSON.parse(JSON.stringify(replay)))).toBe(true);
      expect(validateReplay({ ...replay, version: 41 })).toBe(level <= 12);
      expect(validateSave(JSON.parse(JSON.stringify(m.state)))).toBe(true);
      const viewer = new GameModel();
      expect(viewer.openReplay(JSON.parse(JSON.stringify(replay)))).toBe(true);
      expect(viewer.battle!.buildings[0]).toMatchObject({
        kind: 'archertower',
        level,
        hp: archerTowerStats(level).hp,
      });
      const malformed = structuredClone(replay);
      malformed.initial.buildings[0].level = 22;
      expect(validateReplay(malformed)).toBe(false);
    }
    stage.buildings = [[1000009, 10, 10, 22]];
    expect(nativeCampaignIssues(0)).toContain('Archer Tower level 22');
    expect(() => nativeBuildings(0)).toThrow();
  } finally {
    stage.buildings = original;
  }
  // The home catalog now reaches every original tier; Town Hall 15 buys the last of them.
  expect(BUILDINGS.archertower.maxLevel).toBe(21);
});

it('admits Midnight Oil with its original Infernos', () => {
  expect(nativeCampaignIssues(58)).not.toContain('Archer Tower level 15');
  expect(nativeCampaignIssues(58)).toEqual([]);
  expect(nativeBuildings(58).filter((b) => b.kind === 'inferno')).toHaveLength(4);
});
