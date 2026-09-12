import { GameModel } from '../../src/game/model';
import { emptyArmy } from '../../src/game/army';
import { freshNativeCampaign } from '../../src/game/native-campaign';

/** Legal level-one P.E.K.K.A deployment at the statue in the intact Goblin Picnic layout. */
export function santaBattle(model = new GameModel()) {
  model.state.nativeCampaign = freshNativeCampaign();
  model.state.nativeCampaign.stars.fill(1);
  model.state.army = { ...emptyArmy(), pekka: 1 };
  model.startCampaign(37);
  model.activeTroop = 'pekka';
  if (!model.deploy(36.5, 29.5)) throw Error('Santa fixture deployment failed');
  return model;
}
