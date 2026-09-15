import { GameModel } from '../../src/game/model';
import { emptyArmy } from '../../src/game/army';
import { freshNativeCampaign } from '../../src/game/native-campaign';
import { developedSave } from './developed-village';

/** Legal TH8 army in the original Magic Practice layout, without moved traps or units. */
export function shrinkTrapVillage() {
  const save = developedSave();
  save.buildings.find((b) => b.kind === 'townhall')!.level = 8;
  save.buildings.find((b) => b.kind === 'barracks')!.level = 10;
  save.army = { ...emptyArmy(), pekka: 4, dragon: 5 };
  save.king = undefined;
  save.spells = { lightning: 0, heal: 0, rage: 0, freeze: 0, invisibility: 0 };
  save.nativeCampaign = freshNativeCampaign();
  save.nativeCampaign.stars[53] = 1;
  save.tutorial = true;
  return new GameModel(save).state;
}
export function deployShrinkTrap(model: GameModel) {
  for (const kind of ['pekka', 'dragon'] as const) {
    model.activeTroop = kind;
    while (model.battle!.remaining[kind])
      if (!model.deploy(10, 23)) throw Error('Magic Practice deployment failed');
  }
}
export function shrinkTrapBattle(model = new GameModel(shrinkTrapVillage())) {
  model.startCampaign(54);
  if (!model.battle) throw Error('Magic Practice did not open');
  deployShrinkTrap(model);
  return model;
}
