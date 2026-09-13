import { GameModel, makeBuilding } from '../../src/game/model';
import { emptyArmy } from '../../src/game/army';
import { wizardTowerVillage } from './wizard-tower-battle';

/** Original retained Cannon with a legal fifty-space TH8 ground army. */
export function cannonVillage(level = 15) {
  const save = wizardTowerVillage();
  save.buildings[5] = makeBuilding(6, 'cannon', 18, 18, level);
  save.army = { ...emptyArmy(), giant: 6, wizard: 5 };
  return new GameModel(save).state;
}
export function cannonBattle(level = 15) {
  const m = new GameModel(cannonVillage(level));
  m.startBattle(0, true);
  m.activeTroop = 'giant';
  for (let i = 0; i < 6; i++)
    if (!m.deploy(13.5, 18 + i * 0.6)) throw Error('Cannon Giant deployment failed');
  m.activeTroop = 'wizard';
  for (let i = 0; i < 5; i++)
    if (!m.deploy(12, 18.5 + i * 0.6)) throw Error('Cannon Wizard deployment failed');
  return m;
}
