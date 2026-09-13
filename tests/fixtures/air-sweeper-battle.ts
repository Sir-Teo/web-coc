import { GameModel, makeBuilding } from '../../src/game/model';
import { wizardTowerVillage } from './wizard-tower-battle';

/** Retained original defense, with an ordinary legal TH8 air army in practice. */
export function airSweeperVillage(level = 7) {
  const save = wizardTowerVillage();
  save.buildings[5] = { ...makeBuilding(6, 'airsweeper', 18, 18, level), direction: 4 };
  save.army.giant = 0;
  save.army.dragon = 2;
  save.army.balloon = 2;
  return new GameModel(save).state;
}
export function airSweeperBattle(level = 7) {
  const m = new GameModel(airSweeperVillage(level));
  m.startBattle(0, true);
  m.activeTroop = 'dragon';
  if (!m.deploy(14, 19.5) || !m.deploy(14, 20.5))
    throw Error('Air Sweeper Dragon deployment failed');
  m.activeTroop = 'balloon';
  if (!m.deploy(14, 18.5) || !m.deploy(14, 17.5))
    throw Error('Air Sweeper Balloon deployment failed');
  return m;
}
