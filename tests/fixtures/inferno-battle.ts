import { GameModel, makeBuilding } from '../../src/game/model';
import type { InfernoMode } from '../../src/game/inferno-weapon';
import { cannonVillage } from './cannon-battle';

/** Legal fifty-space ground army against a retained original Inferno tier/mode. */
export function infernoBattle(level = 1, mode: InfernoMode = 'single') {
  const save = cannonVillage(1);
  save.buildings[5] = { ...makeBuilding(6, 'inferno', 18, 18, level), infernoMode: mode };
  const model = new GameModel(save);
  model.startBattle(0, true);
  model.activeTroop = 'giant';
  for (let i = 0; i < 6; i++)
    if (!model.deploy(13.5, 18 + i * 0.6)) throw Error('Inferno Giant deployment failed');
  model.activeTroop = 'wizard';
  for (let i = 0; i < 5; i++)
    if (!model.deploy(12, 18.5 + i * 0.6)) throw Error('Inferno Wizard deployment failed');
  return model;
}
