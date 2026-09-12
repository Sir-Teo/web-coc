import { GameModel, initialSave, makeBuilding } from '../../src/game/model';
import { emptyArmy, emptySpells } from '../../src/game/army';
import { TROOP_KEYS } from '../../src/game/data';

/** Retained high-level tower in practice; legal TH8 troops and a 50-space camp. */
export function wizardTowerVillage(level = 1) {
  const save = initialSave();
  save.obstacles = [];
  save.buildings = [
    makeBuilding(1, 'townhall', 30, 30, 8),
    makeBuilding(2, 'builder', 36, 34),
    makeBuilding(3, 'barracks', 21, 30, 10),
    makeBuilding(4, 'laboratory', 26, 30, 6),
    makeBuilding(5, 'camp', 15, 30, 6),
    makeBuilding(6, 'wizardtower', 18, 18, level),
  ];
  save.nextId = 7;
  save.army = { ...emptyArmy(), giant: 1, dragon: 1 };
  save.troopLevels = Object.fromEntries(TROOP_KEYS.map((kind) => [kind, 1])) as typeof save.army;
  save.troopLevels.giant = 5;
  save.troopLevels.dragon = 3;
  save.spells = emptySpells();
  save.king = undefined;
  save.tutorial = true;
  return new GameModel(save).state;
}

export function wizardTowerBattle(level = 1) {
  const m = new GameModel(wizardTowerVillage(level));
  m.startBattle(0, true);
  m.activeTroop = 'giant';
  if (!m.deploy(14, 19.5)) throw Error('Wizard Tower ground deployment failed');
  m.activeTroop = 'dragon';
  if (!m.deploy(25, 19.5)) throw Error('Wizard Tower air deployment failed');
  return m;
}
