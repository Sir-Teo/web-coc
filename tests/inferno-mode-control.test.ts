import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { validateSave } from '../src/game/save';
it('toggles Inferno modes through edit undo, redo and saved layouts', () => {
  const model = new GameModel();
  const tower = makeBuilding(3, 'inferno', 2, 2, 8);
  model.state.buildings = [
    makeBuilding(1, 'townhall', 10, 10, 8),
    makeBuilding(2, 'builder', 30, 30),
    tower,
  ];
  model.state.nextId = 4;
  model.state.obstacles = [];
  model.selected = 3;
  expect(model.toggleInfernoMode()).toBe(true);
  expect(tower.infernoMode).toBe('multi');
  expect(validateSave(model.state)).toBe(true);
  model.beginEdit();
  model.selected = 3;
  model.saveLayout(0);
  model.toggleInfernoMode();
  expect(tower.infernoMode).toBe('single');
  model.undo();
  expect(tower.infernoMode).toBe('multi');
  model.redo();
  expect(tower.infernoMode).toBe('single');
  model.loadLayout(0);
  expect(tower.infernoMode).toBe('multi');
  model.endEdit();
  model.startBattle(0, true);
  expect(model.toggleInfernoMode()).toBe(false);
});
