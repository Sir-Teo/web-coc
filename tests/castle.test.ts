import { expect, it } from 'vitest';
import { CASTLE_LEVELS, castlePoses } from '../src/game/castle-art';
import {
  buildingHp,
  isDefense,
  isResourceBuilding,
  MAX_TOWNHALL,
  maxCountFor,
  maxLevelFor,
  upgradeCost,
  upgradeSeconds,
} from '../src/game/data';
import { requiredTownHall } from '../src/game/progression';
import { GameModel, makeBuilding } from '../src/game/model';
import { validateReplay, REPLAY_VERSION } from '../src/game/replay';
import { wizardTowerVillage } from './fixtures/wizard-tower-battle';

it('uses every original Castle tier and opens it at the original Town Hall', () => {
  for (const row of CASTLE_LEVELS) {
    expect(buildingHp('clancastle', row.level)).toBe(row.hp);
    expect(requiredTownHall('clancastle', row.level)).toBe(row.townhall);
    if (row.level > 1) {
      expect(upgradeCost('clancastle', row.level - 1)).toBe(row.cost);
      expect(upgradeSeconds('clancastle', row.level - 1)).toBe(row.seconds);
    }
    for (const state of ['guard', 'ruin', 'constructing', 'upgrading'] as const)
      expect(castlePoses(row.level, state).length).toBeGreaterThan(0);
  }
  // One Castle from Town Hall 3, which is where the source gates its first level even though
  // it counts one from Town Hall 1. Reinforcements still need a clan and are not implemented.
  for (let th = 1; th <= MAX_TOWNHALL; th++)
    expect(maxCountFor('clancastle', th), `TH${th}`).toBe(th >= CASTLE_LEVELS[0].townhall ? 1 : 0);
  expect(maxLevelFor('clancastle', MAX_TOWNHALL)).toBe(CASTLE_LEVELS.length);
  expect(isResourceBuilding('clancastle')).toBe(true);
  expect(isDefense('clancastle')).toBe(false);
  expect(() => castlePoses(15)).toThrow();
});

it('keeps Castle Lightning immunity in live practice and replay, with old-version rejection', () => {
  const save = wizardTowerVillage();
  save.buildings[5] = makeBuilding(6, 'clancastle', 18, 18, 5);
  const model = new GameModel(save);
  model.state.spells.lightning = 1;
  model.startBattle(0, true);
  model.activeSpell = 'lightning';
  expect(model.castSpell(19.5, 19.5)).toBe(true);
  expect(model.battle!.buildings.find((b) => b.id === 6)?.hp).toBe(3000);
  model.finishBattle();
  const replay = model.state.raidLog![0].replay!;
  expect(replay.version).toBe(REPLAY_VERSION);
  expect(validateReplay(replay)).toBe(true);
  expect(validateReplay({ ...replay, version: 36 })).toBe(false);
  const viewer = new GameModel();
  expect(viewer.openReplay(replay)).toBe(true);
  viewer.seekReplay(100);
  while (viewer.replay!.seeking) viewer.step(0.05);
  expect(viewer.battle!.buildings.find((b) => b.id === 6)?.hp).toBe(3000);
});
