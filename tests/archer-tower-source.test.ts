import { expect, it } from 'vitest';
import source from '../reference/archer-tower/native.json';
import { nativeCampaignIssues } from '../src/game/native-campaign';
it('preserves all original Archer Tower tiers and distinct level-15 weapon modes', () => {
  expect(source.globalId).toBe(1000009);
  expect(source.levels.map((r) => Number(r.BuildingLevel))).toEqual(
    Array.from({ length: 21 }, (_, i) => i + 1),
  );
  expect(source.levels[14]).toMatchObject({
    Hitpoints: '1230',
    DPS: '85',
    AttackSpeed: '500',
    AttackRange: '1000',
    AltDPS: '200',
    AltAttackSpeed: '250',
    AltAttackRange: '800',
    Projectile: 'Tower Arrow Fire3',
    AltProjectile: 'Tower Arrow Fire3 LOW',
    ExportName: 'tower_turret_lvl15',
    AlternateExportName: 'tower_turret_lvl15_down',
  });
  expect(Object.keys(source.projectiles)).toHaveLength(10);
  expect(Object.keys(source.effects)).toHaveLength(7);
  expect(Object.keys(source.particles)).toHaveLength(11);
  for (const row of source.levels)
    for (const key of ['Projectile', 'AltProjectile'] as const)
      expect(source.projectiles).toHaveProperty(row[key]);
  expect(nativeCampaignIssues(58)).not.toContain('Archer Tower level 15');
});
