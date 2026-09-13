import { GameModel, makeBuilding } from '../../src/game/model';
import { emptyArmy } from '../../src/game/army';
import { wizardTowerVillage } from './wizard-tower-battle';

/** Original retained Mortar with a legal fifty-space TH8 ground army. */
export function mortarVillage(level = 11) {
  const save = wizardTowerVillage();
  save.buildings[5] = makeBuilding(6, 'mortar', 18, 18, level);
  save.army = { ...emptyArmy(), giant: 6, wizard: 5 };
  return new GameModel(save).state;
}
export function mortarBattle(level = 11) {
  const m = new GameModel(mortarVillage(level));
  m.startBattle(0, true);
  m.activeTroop = 'giant';
  for (let i = 0; i < 6; i++)
    if (!m.deploy(13.5, 18 + i * 0.6)) throw Error('Mortar Giant deployment failed');
  m.activeTroop = 'wizard';
  for (let i = 0; i < 5; i++)
    if (!m.deploy(12, 18.5 + i * 0.6)) throw Error('Mortar Wizard deployment failed');
  return m;
}
