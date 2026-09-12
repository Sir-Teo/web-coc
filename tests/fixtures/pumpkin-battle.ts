import { GameModel } from '../../src/game/model';
import { emptyArmy } from '../../src/game/army';
import { freshNativeCampaign } from '../../src/game/native-campaign';

/** Actual Rat Valley layout and a legal deployment at its native Pumpkin Bomb. */
export function pumpkinBattle(model = new GameModel()) {
  model.state.nativeCampaign = freshNativeCampaign();
  model.state.nativeCampaign.stars.fill(1);
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.startCampaign(9);
  model.activeTroop = 'giant';
  if (!model.deploy(35, 9.5)) throw Error('Pumpkin fixture deployment failed');
  return model;
}
