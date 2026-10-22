import { GameModel, initialSave, makeBuilding } from '../../src/game/model';
import { emptyArmy } from '../../src/game/army';
import { validateSave } from '../../src/game/save';

export const ART_GRAPH_CASES = [
  { kind: 'xbow', name: 'X-Bow', module: 'reference/xbow/runtime.json' },
  {
    kind: 'wizardtower',
    name: 'Wizard Tower defender',
    module: 'reference/wizard-tower/defender.json',
  },
] as const;

export function artGraphSave(kind: (typeof ART_GRAPH_CASES)[number]['kind']) {
  const state = initialSave();
  state.tutorial = true;
  state.obstacles = [];
  state.army = emptyArmy();
  state.buildings = [
    makeBuilding(1, 'townhall', 20, 20, 9),
    makeBuilding(2, 'builder', 26, 26),
    makeBuilding(3, kind, 10, 10, 1),
  ];
  state.nextId = 4;
  const save = new GameModel(state).state;
  if (!validateSave(save)) throw Error('Invalid owned-art graph fixture');
  return JSON.stringify(save);
}
