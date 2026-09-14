import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import source from '../reference/archer-tower/native.json';
import catalog from '../reference/archer-tower/catalog.json';
import {
  ARCHER_TOWER_LEVELS,
  ARCHER_TOWER,
  archerTowerStats,
  archerTowerWeapon,
  archerTowerProjectileRow,
} from '../src/game/archer-tower-stats';
import { buildingHp, defenseDamage, BUILDINGS } from '../src/game/data';
import { nativeCampaignIssues } from '../src/game/native-campaign';
import { GameModel, makeBuilding } from '../src/game/model';
import { validateSave } from '../src/game/save';

it('uses all 21 source-defined base tiers without a generic health or DPS fallback', () => {
  expect(catalog.sourceSha256).toBe(
    createHash('sha256').update(readFileSync('reference/archer-tower/native.json')).digest('hex'),
  );
  expect(ARCHER_TOWER_LEVELS).toHaveLength(21);
  for (const original of source.levels) {
    const row = original as Record<string, string>;
    const level = Number(row.BuildingLevel);
    const stats = archerTowerStats(level);
    expect(stats.hp).toBe(Number(row.Hitpoints));
    expect(stats.cost).toBe(Number(row.BuildCost));
    expect(stats.townHall).toBe(Number(row.TownHallLevel));
    expect(stats.seconds).toBe(
      Number(row.BuildTimeD || 0) * 86400 +
        Number(row.BuildTimeH || 0) * 3600 +
        Number(row.BuildTimeM || 0) * 60 +
        Number(row.BuildTimeS || 0),
    );
    expect(buildingHp('archertower', level)).toBe(stats.hp);
    expect(makeBuilding(999, 'archertower', 20, 20, level).maxHp).toBe(stats.hp);
    expect(defenseDamage('archertower', level)).toBe(
      (Number(row.DPS) * Number(row.AttackSpeed)) / 1000,
    );
    for (const alternate of [false, true]) {
      const prefix = alternate ? 'Alt' : '';
      expect(archerTowerWeapon(level, alternate)).toEqual({
        dps: Number(row[prefix + 'DPS']),
        intervalMs: Number(row[prefix + 'AttackSpeed']),
        range: Number(row[prefix + 'AttackRange']),
        projectile: row[prefix + 'Projectile'],
        airTargets: row[prefix + 'AirTargets'] === 'TRUE',
        groundTargets: row[prefix + 'GroundTargets'] === 'TRUE',
      });
      expect(archerTowerProjectileRow(level, alternate)).toEqual(
        source.projectiles[row[prefix + 'Projectile']][0],
      );
    }
  }
  expect(ARCHER_TOWER).toEqual({ range: 10, interval: 0.5 });
  expect(archerTowerStats(15)).toMatchObject({
    hp: 1230,
    weapon: { dps: 85 },
    alternateWeapon: { dps: 200 },
  });
  expect(archerTowerStats(21)).toMatchObject({
    hp: 1800,
    weapon: { dps: 145 },
    alternateWeapon: { dps: 290 },
  });
});
it('keeps progression and campaign acceptance separate from source tier coverage', () => {
  const model = new GameModel();
  model.townhall!.level = 8;
  expect(model.maxLevel('archertower')).toBe(10);
  expect(BUILDINGS.archertower.maxLevel).toBe(21);
  model.state.buildings.push(makeBuilding(999, 'archertower', 20, 20, 22));
  expect(validateSave(model.state)).toBe(false);
  expect(nativeCampaignIssues(58)).not.toContain('Archer Tower level 15');
  for (const level of [0, 22, 1.5, NaN]) expect(() => archerTowerStats(level)).toThrow();
});
