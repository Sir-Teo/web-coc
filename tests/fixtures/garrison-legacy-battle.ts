import { GameModel, makeBuilding } from '../../src/game/model';
import { emptyArmy } from '../../src/game/army';
import { wizardTowerVillage } from './wizard-tower-battle';

/** Legal TH8 practice input for the archived pre-garrison defender simulation. */
export function garrisonLegacyBattle(mode: 'ground' | 'air') {
  const save = wizardTowerVillage();
  save.buildings[5] = { ...makeBuilding(6, 'skeletontrap', 18, 18, 2), skeletonMode: mode };
  save.buildings.push({ ...makeBuilding(7, 'skeletontrap', 20, 18, 2), skeletonMode: mode });
  save.nextId = 8;
  save.army =
    mode === 'air'
      ? { ...emptyArmy(), dragon: 2, balloon: 2 }
      : { ...emptyArmy(), giant: 4, archer: 10, wizard: 5 };
  const model = new GameModel(save);
  model.startBattle(0, true);
  const groups =
    mode === 'air'
      ? ([
          ['balloon', 2, 16, 18],
          ['dragon', 2, 12, 20],
        ] as const)
      : ([
          ['giant', 4, 16, 18],
          ['archer', 10, 12, 17],
          ['wizard', 5, 11, 20],
        ] as const);
  for (const [kind, count, x, y] of groups) {
    model.activeTroop = kind;
    for (let i = 0; i < count; i++)
      if (!model.deploy(x, y + i * 0.2))
        throw Error(`Historical ${mode} ${kind} deployment failed`);
  }
  return model;
}
