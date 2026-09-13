import { expect, it } from 'vitest';
import native from '../reference/wizard-tower/native.json';
import {
  BUILDINGS,
  buildingHp,
  defenseDps,
  defenseDamage,
  upgradeCost,
  upgradeSeconds,
  maxLevelFor,
} from '../src/game/data';
import {
  WIZARD_TOWER,
  WIZARD_TOWER_LEVELS,
  wizardTowerStats,
} from '../src/game/wizard-tower-stats';
import { NATIVE_COMBAT, nativeCampaignIssues } from '../src/game/native-campaign';
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
  it(`uses original level ${i + 1} health, weapon, costs and Town Hall requirement`, () => {
    const level = i + 1;
    expect(buildingHp('wizardtower', level)).toBe(Number(row.Hitpoints));
    expect(defenseDps('wizardtower', level)).toBe(Number(row.DPS));
    expect(defenseDamage('wizardtower', level)).toBeCloseTo(
      (Number(row.DPS) * Number(row.AttackSpeed)) / 1000,
      10,
    );
    expect(requiredTownHall('wizardtower', level)).toBe(Number(row.TownHallLevel));
    expect(wizardTowerStats(level).projectile).toBe(row.Projectile);
    expect(wizardTowerStats(level).defender).toBe(row.DefenderCharacter);
    expect(wizardTowerStats(level).hitEffect).toBe(row.HitEffect);
    if (level > 1) {
      expect(upgradeCost('wizardtower', level - 1)).toBe(Number(row.BuildCost));
      expect(upgradeSeconds('wizardtower', level - 1)).toBe(
        Number(row.BuildTimeD) * 86400 +
          Number(row.BuildTimeH) * 3600 +
          Number(row.BuildTimeM) * 60 +
          Number(row.BuildTimeS),
      );
    }
    expect(NATIVE_COMBAT[1000011].hp[i]).toBe(Number(row.Hitpoints));
    expect(NATIVE_COMBAT[1000011].dps[i]).toBe(Number(row.DPS));
  });

it('keeps exact later levels in saves and practice while enforcing the TH8 purchase/upgrade ceiling', () => {
  expect(WIZARD_TOWER_LEVELS).toHaveLength(17);
  expect(BUILDINGS.wizardtower.maxLevel).toBe(17);
  expect(maxLevelFor('wizardtower', 8)).toBe(6);
  expect(WIZARD_TOWER).toMatchObject({
    interval: 1.3,
    range: 7,
    splash: 1,
  });
  for (let level = 1; level <= 17; level++) {
    const m = new GameModel();
    m.state.obstacles = [];
    m.state.buildings = [
      makeBuilding(1, 'townhall', 30, 30, 8),
      makeBuilding(2, 'wizardtower', 10, 10, level),
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
    if (level >= 6) {
      restored.state.gold = 30000000;
      restored.upgrade(2);
      expect(tower.upgradeEnd).toBeUndefined();
      expect(restored.state.gold).toBe(30000000);
    }
    restored.startBattle(0, true);
    expect(restored.battle!.buildings[1]).toMatchObject({ level, hp: tower.hp });
  }
  const invalid = new GameModel();
  invalid.state.buildings[0] = { ...invalid.state.buildings[0], kind: 'wizardtower', level: 18 };
  expect(validateSave(invalid.state)).toBe(false);
});

it('keeps Magic Practice gated by the original campaign Shrink Trap', () => {
  expect(nativeCampaignIssues(54)).toEqual([]);
});
