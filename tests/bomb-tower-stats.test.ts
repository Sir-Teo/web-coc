import { expect, it } from 'vitest';
import native from '../reference/bombtower/native.json';
import {
  BUILDINGS,
  buildingHp,
  defenseDps,
  defenseDamage,
  upgradeCost,
  upgradeSeconds,
  maxLevelFor,
} from '../src/game/data';
import { BOMB_TOWER, BOMB_TOWER_LEVELS, bombTowerStats } from '../src/game/bomb-tower-stats';
import { bombTowerDeathDamage } from '../src/game/bomb-tower';
import { NATIVE_COMBAT, nativeBuildings, nativeCampaignIssues } from '../src/game/native-campaign';
import { requiredTownHall } from '../src/game/progression';
import { GameModel, makeBuilding } from '../src/game/model';
import { validateSave } from '../src/game/save';

// Independently inherit the retained original CSV rows, rather than the runtime level table.
let inherited: Record<string, string> = {};
const original = native.building.map((row) => {
  inherited = { ...inherited, ...row };
  return inherited;
});
for (const [i, row] of original.entries())
  it(`uses original level ${i + 1} health, weapon, death damage, costs and Town Hall requirement`, () => {
    const level = i + 1;
    expect(buildingHp('bombtower', level)).toBe(Number(row.Hitpoints));
    expect(defenseDps('bombtower', level)).toBe(Number(row.DPS));
    expect(defenseDamage('bombtower', level)).toBeCloseTo(
      (Number(row.DPS) * Number(row.AttackSpeed)) / 1000,
      10,
    );
    expect(bombTowerDeathDamage(level)).toBe(Number(row.DieDamage));
    expect(requiredTownHall('bombtower', level)).toBe(Number(row.TownHallLevel));
    expect(bombTowerStats(level).projectile).toBe(row.Projectile);
    expect(bombTowerStats(level).defender).toBe(row.DefenderCharacter);
    expect(bombTowerStats(level).hitEffect).toBe(row.HitEffect);
    expect(bombTowerStats(level).destroyedEffect).toBe(row.DestroyDamageEffect);
    if (level > 1) {
      expect(upgradeCost('bombtower', level - 1)).toBe(Number(row.BuildCost));
      expect(upgradeSeconds('bombtower', level - 1)).toBe(
        Number(row.BuildTimeD) * 86400 +
          Number(row.BuildTimeH) * 3600 +
          Number(row.BuildTimeM) * 60 +
          Number(row.BuildTimeS),
      );
    }
    expect(NATIVE_COMBAT[1000032].hp[i]).toBe(Number(row.Hitpoints));
    expect(NATIVE_COMBAT[1000032].dps[i]).toBe(Number(row.DPS));
  });

it('keeps exact later levels in saves and practice while enforcing the TH8 purchase/upgrade ceiling', () => {
  expect(BOMB_TOWER_LEVELS).toHaveLength(13);
  expect(BUILDINGS.bombtower.maxLevel).toBe(13);
  expect(maxLevelFor('bombtower', 8)).toBe(2);
  expect(BOMB_TOWER).toMatchObject({
    interval: 1.1,
    range: 6,
    splash: 1.5,
    deathRadius: 2.75,
    deathDelay: 1,
  });
  for (let level = 1; level <= 13; level++) {
    const m = new GameModel();
    m.state.obstacles = [];
    m.state.buildings = [
      makeBuilding(1, 'townhall', 30, 30, 8),
      makeBuilding(2, 'bombtower', 10, 10, level),
      makeBuilding(3, 'builder', 26, 26),
    ];
    m.state.nextId = 4;
    expect(validateSave(m.state)).toBe(true);
    const restored = new GameModel(JSON.parse(JSON.stringify(m.state)));
    const tower = restored.state.buildings[1];
    expect(tower).toMatchObject({
      level,
      hp: Number(original[level - 1].Hitpoints),
      maxHp: Number(original[level - 1].Hitpoints),
    });
    if (level >= 2) {
      restored.state.gold = 30000000;
      restored.upgrade(2);
      expect(tower.upgradeEnd).toBeUndefined();
      expect(restored.state.gold).toBe(30000000);
    }
    restored.startBattle(0, true);
    expect(restored.battle!.buildings[1]).toMatchObject({ level, hp: tower.hp });
  }
  const invalid = new GameModel();
  invalid.state.buildings[0] = { ...invalid.state.buildings[0], kind: 'bombtower', level: 14 };
  expect(validateSave(invalid.state)).toBe(false);
});

it('enables the unchanged Invaders layout with exact level-three damage and retains subsequent gates', () => {
  expect(nativeCampaignIssues(50)).toEqual([]);
  const buildings = nativeBuildings(50);
  expect(buildings).toHaveLength(272);
  const bomb = buildings.find((b) => b.kind === 'bombtower')!;
  expect(bomb).toMatchObject({ x: 13, y: 22, level: 3, hp: 750, maxHp: 750 });
  expect(defenseDamage(bomb.kind, bomb.level)).toBeCloseTo(35.2, 10);
  expect(bombTowerDeathDamage(bomb.level)).toBe(220);
  expect(buildings.filter((b) => b.kind === 'xbow').map((b) => b.xbowMode)).toEqual([
    'ground',
    'ground',
    'both',
    'both',
  ]);
  expect(nativeCampaignIssues(51)).toEqual(['Seeking Air Mine level 3']);
});
