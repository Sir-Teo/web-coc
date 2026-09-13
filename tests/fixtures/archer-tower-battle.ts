import { GameModel, makeBuilding } from '../../src/game/model';
import { cannonVillage } from './cannon-battle';
export function archerTowerBattle(level = 10) {
  const save = cannonVillage(1);
  save.buildings[5] = makeBuilding(6, 'archertower', 18, 18, level);
  const model = new GameModel(save);
  model.startBattle(0, true);
  model.activeTroop = 'giant';
  for (let i = 0; i < 6; i++)
    if (!model.deploy(13.5, 18 + i * 0.6)) throw new Error('Archer Tower Giant deployment failed');
  model.activeTroop = 'wizard';
  for (let i = 0; i < 5; i++)
    if (!model.deploy(12, 18.5 + i * 0.6)) throw new Error('Archer Tower Wizard deployment failed');
  return model;
}
