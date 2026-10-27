import { expect, it } from 'vitest';
import {
  ALL_LATE_BUILDING_ART,
  LATE_BUILDING_ART,
  lateBuildingArtMask,
  lateBuildingDemand,
} from '../src/game/late-building-demand';
import { BUILDINGS, type BuildingKind } from '../src/game/data';
import { type Battle, type Building, makeBuilding } from '../src/game/model';
import {
  isLateBuilding,
  isLateCampaignBuilding,
  LATE_NPC_BUILDINGS,
} from '../src/game/late-campaign';
import { armedBuilderHut } from '../src/game/builder-hut';
import { lateTrapArena } from './fixtures/late-trap-battle';

it('selects the home defense families without campaign hut bodies', () => {
  expect(
    lateBuildingDemand([
      makeBuilding(1, 'monolith', 20, 20),
      makeBuilding(2, 'eagleartillery', 24, 20),
      makeBuilding(3, 'builder', 28, 20, 8),
    ]),
  ).toBe(LATE_BUILDING_ART.monolith | LATE_BUILDING_ART.eagleArtillery);
});
it('maps concealed traps and all late Goblin identities to their body families', () => {
  for (const npc of LATE_NPC_BUILDINGS) {
    const building = makeBuilding(1, 'bomb', 20, 20);
    building.npc = npc;
    expect(lateBuildingArtMask(building)).toBe(
      npc === 'freeze-trap'
        ? LATE_BUILDING_ART.freezeTrap
        : npc === 'ghost-trap'
          ? LATE_BUILDING_ART.ghostTrap
          : LATE_BUILDING_ART.goblinBuildings,
    );
  }
});
it('matches the body renderer for campaign, practice and legacy huts', () => {
  const { b } = lateTrapArena([]);
  b.late = {};
  const campaign = { ...b, catalog: 'goblin-v1', practice: false } as Battle;
  const rehearsal = { ...campaign, practice: true };
  const legacy = { ...campaign };
  delete legacy.late;
  for (const level of [1, 2, 4, 8]) {
    const hut = makeBuilding(1, 'builder', 20, 20, level);
    for (const battle of [null, b, campaign, rehearsal, legacy])
      expect(!!lateBuildingArtMask(hut, battle)).toBe(armedBuilderHut(battle, hut));
  }
});
it('keeps the level-one campaign hut trigger distinct from its available renderer', () => {
  const { b } = lateTrapArena([]);
  b.late = {};
  const hut = makeBuilding(1, 'builder', 20, 20, 1);
  const campaign = { ...b, catalog: 'goblin-v1', practice: false } as Battle;
  expect(isLateCampaignBuilding(hut)).toBe(false);
  expect(lateBuildingArtMask(hut, campaign)).toBe(LATE_BUILDING_ART.builderHut);
});
it('covers every building kind and late NPC identity under every hut battle rule', () => {
  const { b } = lateTrapArena([]);
  b.late = {};
  const campaign = { ...b, catalog: 'goblin-v1', practice: false } as Battle;
  const legacy = { ...campaign };
  delete legacy.late;
  for (const kind of Object.keys(BUILDINGS) as BuildingKind[])
    for (const npc of [undefined, ...LATE_NPC_BUILDINGS])
      for (const level of [1, 2, 4, 8])
        for (const battle of [null, b, campaign, { ...campaign, practice: true }, legacy]) {
          const building = { kind, npc, level };
          expect(!!lateBuildingArtMask(building, battle)).toBe(
            isLateBuilding(building) || armedBuilderHut(battle, building as Building),
          );
        }
});
it('unions and deduplicates all families without changing the buildings or battle', () => {
  const { b } = lateTrapArena([]);
  b.late = {};
  const buildings = [
    'spelltower',
    'tornadotrap',
    'eagleartillery',
    'scattershot',
    'monolith',
    'builder',
  ].map((kind, i) => makeBuilding(i + 1, kind as BuildingKind, 20, 20, 2));
  for (const npc of LATE_NPC_BUILDINGS) {
    const building = makeBuilding(buildings.length + 1, 'bomb', 24, 24);
    building.npc = npc;
    buildings.push(building);
  }
  const before = JSON.stringify({ buildings, b });
  expect(lateBuildingDemand([...buildings, ...buildings], b)).toBe(ALL_LATE_BUILDING_ART);
  expect(ALL_LATE_BUILDING_ART).toBe(511);
  expect(JSON.stringify({ buildings, b })).toBe(before);
});
