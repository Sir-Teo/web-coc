import { GameModel } from '../../src/game/model';
import { emptyArmy } from '../../src/game/army';
import { freshNativeCampaign } from '../../src/game/native-campaign';

/** Legal deployment beside all five native level-three traps in Obsidian Tower. */
export function obsidianBattle(model = new GameModel()) {
  model.state.nativeCampaign = freshNativeCampaign();
  model.state.nativeCampaign.stars.fill(1);
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.startCampaign(26);
  model.activeTroop = 'giant';
  if (!model.deploy(41, 41)) throw Error('Obsidian fixture deployment failed');
  return model;
}
