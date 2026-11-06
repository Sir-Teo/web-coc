import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { expect, it } from 'vitest';
import audit from '../reference/practice/readiness.json';
import campaign from '../reference/campaign/catalog.json';
import { BUILD_MIN, MAP_SIZE } from '../src/game/grid';
import {
  NATIVE_CAMPAIGN,
  NATIVE_COMBAT,
  nativeBuildings,
  nativeCampaignIssues,
} from '../src/game/native-campaign';

function withPlacement(x: number, y: number, check: (index: number) => void, data = 1000015) {
  const stage = structuredClone(NATIVE_CAMPAIGN[0]);
  stage.stage = NATIVE_CAMPAIGN.length + 1;
  stage.buildings = [[data, x, y, 1]];
  stage.traps = [];
  const index = NATIVE_CAMPAIGN.length;
  NATIVE_CAMPAIGN.push(stage);
  try {
    check(index);
  } finally {
    NATIVE_CAMPAIGN.pop();
  }
}

it('rejects a real withheld Builder Hut footprint before it can enter a battle', () => {
  const whirl = audit.levels.find((level) => level.id === 'CHALLENGE_TH8_GOWIVA')!;
  expect(whirl.outsideFootprints).toHaveLength(1);
  const hut = whirl.outsideFootprints[0];
  expect(hut).toMatchObject({ sourceX: 30, sourceY: 45, size: 2, bottom: 49 });
  withPlacement(hut.sourceX, hut.sourceY, (index) => {
    expect(nativeCampaignIssues(index)).toContain('Builders Hut footprint outside 48-tile board');
    expect(() => nativeBuildings(index)).toThrow('footprint outside 48-tile board');
  });
});

it('accepts exact board edges and refuses each overrun or invalid coordinate', () => {
  for (const [x, y] of [
    [44, 44],
    [-2, -2],
    [0, 0],
  ])
    withPlacement(x, y, (index) => {
      expect(nativeCampaignIssues(index)).toEqual([]);
      expect(nativeBuildings(index)).toHaveLength(1);
    });
  for (const [x, y] of [
    [45, 44],
    [44, 45],
    [-3, 0],
    [0, -3],
    [NaN, 0],
    [0, 1.5],
  ])
    withPlacement(x, y, (index) => {
      expect(nativeCampaignIssues(index)).toContain('Builders Hut footprint outside 48-tile board');
    });
});

it('reports missing source tables instead of treating a known building kind as supported', () => {
  const stats = NATIVE_COMBAT[1000059];
  delete NATIVE_COMBAT[1000059];
  try {
    withPlacement(
      3,
      3,
      (index) => {
        expect(nativeCampaignIssues(index).join()).toContain('Missing source stats');
        expect(() => nativeBuildings(index)).toThrow('Missing source stats');
      },
      1000059,
    );
  } finally {
    NATIVE_COMBAT[1000059] = stats;
  }
});

it('keeps every existing campaign village playable without renumbering', () => {
  expect(NATIVE_CAMPAIGN).toHaveLength(152);
  for (const [index, stage] of NATIVE_CAMPAIGN.entries()) {
    expect(stage.stage).toBe(index + 1);
    expect(nativeCampaignIssues(index)).toEqual([]);
  }
});

it('retains all six original full-map layouts and distinguishes board limits from missing source coverage', () => {
  expect(audit.grid).toEqual({ mapSize: MAP_SIZE, sourceOffset: BUILD_MIN });
  expect(audit.coverageCatalogSha256).toBe(
    createHash('sha256').update(fs.readFileSync('reference/characters/catalog.json')).digest('hex'),
  );
  expect(audit.levels.map((level) => level.id).sort()).toEqual(
    [...Object.keys(campaign.withheld), 'CHALLENGE_TH9_BABYDQW', 'CHALLENGE_TH12_DRAGBAT'].sort(),
  );
  for (const level of audit.levels) {
    expect(level.useFullMapSize).toBe(true);
    expect(level.outsideFootprints.length).toBeGreaterThan(0);
    expect(level.minimumBoardAtCurrentOffset.height).toBeGreaterThan(MAP_SIZE);
  }
  const yeti = audit.levels.find((level) => level.id === 'CHALLENGE_TH12_YETI')!;
  expect(yeti.defenders).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ character: 'Lava Hound', animationCaptured: false }),
      expect.objectContaining({ character: 'Baby Dragon', animationCaptured: true }),
    ]),
  );
  const hybrid = audit.levels.find((level) => level.id === 'CHALLENGE_TH13_HYBRID')!;
  expect(hybrid.defenders[0]).toMatchObject({
    character: 'Ice Golem',
    animationCaptured: false,
    combatRowRetained: false,
    ability: 'IceGolemOnDeathDEF',
    abilityRetained: false,
  });
});

it('retains source guide targets beyond the board, including legacy clamped fielded lessons', () => {
  expect(audit.guideLevels).toHaveLength(19);
  expect(audit.minimumSharedGuideBoard).toBe(52);
  const yeti = audit.guideLevels.find((level) => level.id === 'CHALLENGE_TH12_YETI')!;
  expect(yeti.clampedTargets).toEqual(
    expect.arrayContaining([expect.objectContaining({ sourceX: 49, convertedX: 51, exact: true })]),
  );
  const fielded = audit.guideLevels.filter(
    (level) => level.stage && level.stage <= 103 && level.clampedTargets.length,
  );
  expect(fielded.map((level) => level.name)).toEqual([
    'Lava & Loons',
    'Witch Slap',
    'Bowling with Bats',
    'Electro Surgery',
  ]);
  const queen = fielded[0].clampedTargets.find((step) => step.unit === 'Archer Queen')!;
  expect(queen).toMatchObject({
    sourceX: 49,
    sourceY: 27,
    convertedX: 51,
    convertedY: 29,
    exact: true,
  });
});
