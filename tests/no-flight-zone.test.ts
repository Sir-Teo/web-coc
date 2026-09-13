import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import {
  freshNativeCampaign,
  nativeBuildings,
  nativeCampaignIssues,
} from '../src/game/native-campaign';
import { campaignGarrisonSetup, resolvedCampaignGarrison } from '../src/game/garrison-campaign';
import { emptyArmy } from '../src/game/army';
import { wizardTowerVillage } from './fixtures/wizard-tower-battle';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

function raid() {
  const save = wizardTowerVillage();
  save.nativeCampaign = freshNativeCampaign();
  save.nativeCampaign.stars.fill(1);
  save.army = { ...emptyArmy(), dragon: 2 };
  const model = new GameModel(save);
  model.startCampaign(56);
  expect(model.battle?.index).toBe(56);
  model.activeTroop = 'dragon';
  const sites = Array.from({ length: 48 * 48 }, (_, i) => ({
    x: (i % 48) + 0.5,
    y: Math.floor(i / 48) + 0.5,
  }))
    .filter((p) => !model.deployBlocked(p.x, p.y))
    .sort((a, b) => Math.hypot(a.x - 14.5, a.y - 21.5) - Math.hypot(b.x - 14.5, b.y - 21.5));
  expect(Math.hypot(sites[0].x - 14.5, sites[0].y - 21.5)).toBeLessThan(13);
  expect(model.deploy(sites[0].x, sites[0].y)).toBe(true);
  return model;
}

it('preserves the original Castle and all 35 housing spaces without unlocking unresolved rosters', () => {
  expect(nativeCampaignIssues(56)).toEqual([]);
  const buildings = nativeBuildings(56);
  const castle = buildings.find((b) => b.kind === 'clancastle')!;
  expect(castle).toMatchObject({ x: 13, y: 20, level: 5, hp: 3000 });
  expect(campaignGarrisonSetup(56, buildings)).toEqual([
    {
      castleId: castle.id,
      mode: 'guard',
      troops: [
        { kind: 'dragon', level: 7, count: 1 },
        { kind: 'balloon', level: 8, count: 3 },
      ],
    },
  ]);
  // Later rosters resolve only when every member is supported; others stay gated in their entirety.
  for (const index of [69, 73, 74, 76, 83, 89]) {
    expect(resolvedCampaignGarrison(index)).toBeNull();
    expect(nativeCampaignIssues(index)).toContain('Garrison defenders');
  }
  for (const index of [67, 72, 77]) {
    expect(resolvedCampaignGarrison(index)).not.toBeNull();
    expect(nativeCampaignIssues(index)).not.toContain('Garrison defenders');
  }
  expect(() => campaignGarrisonSetup(56, [])).toThrow();
});

it('plays and portably reconstructs No Flight Zone while retaining Balloons during an air-only raid', () => {
  const model = raid();
  for (let i = 0; i < 120; i++) model.step(0.05);
  const battle = model.battle!;
  expect(battle.defenders?.map((d) => d.kind)).toEqual(['dragon']);
  expect(battle.garrisons![0].troops.find((t) => t.kind === 'balloon')?.count).toBe(3);
  const state = structuredClone(battle);
  model.finishBattle();
  const record = parseReplayFile(JSON.stringify(makeReplayFile(model.state.raidLog![0].replay!)));
  expect(record.initial.garrisons![0].troops.map((t) => t.count)).toEqual([1, 3]);
  const viewer = new GameModel();
  expect(viewer.openReplay(record)).toBe(true);
  viewer.seekReplay(state.elapsed);
  while (viewer.replay!.seeking) viewer.step(0.05);
  // The end action shares the final timestamp, so compare retained combat state explicitly.
  expect(viewer.battle!.defenders).toEqual(state.defenders);
  expect(viewer.battle!.garrisons).toEqual(state.garrisons);
  expect(viewer.battle!.units).toEqual(state.units);
  expect(viewer.battle!.buildings).toEqual(state.buildings);
});
