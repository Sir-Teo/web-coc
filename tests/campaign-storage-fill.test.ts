import { expect, it } from 'vitest';
import { campaignStorageFill } from '../src/game/campaign-storage-fill';
import { GameModel, makeBuilding } from '../src/game/model';
import { freshNativeCampaign } from '../src/game/native-campaign';

it('renders Goblin storage from the level inventory and individual holder health', () => {
  const model = new GameModel();
  model.state.nativeCampaign = freshNativeCampaign();
  model.state.nativeCampaign.stars[7] = 1;
  model.startCampaign(8);
  const battle = model.battle!;
  const gold = makeBuilding(99, 'goldstorage', 2, 2, 1);
  const elixir = makeBuilding(100, 'elixirstorage', 6, 2, 1);
  expect(campaignStorageFill(gold, battle, 'gold')).toBe(1);
  expect(campaignStorageFill(elixir, battle, 'elixir')).toBe(1);
  battle.availableLoot = { gold: 2000, elixir: 0 };
  gold.hp /= 2;
  expect(campaignStorageFill(gold, battle, 'gold')).toBe(0.125);
  expect(campaignStorageFill(elixir, battle, 'elixir')).toBe(0);
});
