import { expect, it } from 'vitest';
import inferno from '../reference/inferno/catalog.json';
import infernoSource from '../reference/inferno/native.json';
import drill from '../reference/dark-drill/catalog.json';
import drillSource from '../reference/dark-drill/native.json';
import { NATIVE_CAMPAIGN, NATIVE_COMBAT, nativeCampaignIssues } from '../src/game/native-campaign';

it('matches the independently captured campaign combat values without clamping source levels', () => {
  for (const family of [inferno, drill]) {
    const combat = NATIVE_COMBAT[family.globalId];
    expect(family.levels.map((r) => r.hp)).toEqual(combat.hp);
    expect(family.levels.map((r) => r.level)).toEqual(combat.hp.map((_, i) => i + 1));
  }
  expect(inferno.levels.map((r) => r.weapon.dps[0])).toEqual(NATIVE_COMBAT[1000027].dps);
  expect(inferno.levels[0].weapon.dps).toEqual([30, 80, 800]);
  expect(inferno.levels[11].weapon.dps).toEqual([155, 330, 3300]);
  expect(inferno.levels[6].weapon.alternateTargets).toBe(5);
  expect(inferno.levels[7].weapon.alternateTargets).toBe(6);
  expect(
    inferno.levels.every(
      (r) => r.weapon.switchTimesMs[0] === 1500 && r.weapon.switchTimesMs[1] === 5250,
    ),
  ).toBe(true);
  expect(drill.levels[0].production).toEqual({
    resource: 'DarkElixir',
    per100Hours: 2000,
    capacity: 160,
  });
});

it('keeps mini-levels separate and preserves every effect/emitter reference before campaign integration', () => {
  for (const source of [infernoSource, drillSource]) {
    expect(source.miniLevels.rows[0].TargetBuilding).toBe(source.name);
    for (const row of source.levels)
      for (const [key, value] of Object.entries(row))
        if (key.includes('ExportName')) expect(source.artInventory.exports).toHaveProperty(value);
    for (const rows of Object.values(source.particles))
      for (const row of rows)
        if ('ParticleExportName' in row)
          expect(source.artInventory.exports).toHaveProperty(row.ParticleExportName);
    const effects = source.effects as Record<string, Record<string, string>[]>;
    for (const row of source.levels)
      for (const [key, value] of Object.entries(row))
        if (key.endsWith('Effect') || key.includes('EffectLv'))
          expect(effects).toHaveProperty(value);
    for (const rows of Object.values(effects))
      for (const row of rows)
        if (row.ParticleEmitter) expect(source.particles).toHaveProperty(row.ParticleEmitter);
  }
  expect(infernoSource.artInventory.blendModes).toEqual([0, 3, 8]);
  expect(Object.keys(infernoSource.artInventory.unsupportedBlendClips)).toHaveLength(22);
  expect(drillSource.artInventory.blendModes).toEqual([0]);
  expect(infernoSource.miniLevels.rows).toHaveLength(2);
  expect(drillSource.miniLevels.rows).toHaveLength(3);
  expect(NATIVE_CAMPAIGN[58].name).toBe('Midnight Oil');
  expect(NATIVE_CAMPAIGN[58].buildings.filter(([id]) => id === inferno.globalId)).toHaveLength(4);
  expect(NATIVE_CAMPAIGN[58].buildings.filter(([id]) => id === drill.globalId)).toHaveLength(1);
  expect(nativeCampaignIssues(58)).toEqual([
    'Inferno Tower',
    'Archer Tower level 15',
  ]);
});
