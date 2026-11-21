import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { campaignStorageFill } from '../src/game/campaign-storage-fill';
import { GameModel, makeBuilding } from '../src/game/model';
import { freshNativeCampaign } from '../src/game/native-campaign';
import {
  nativeResourceFrames,
  nativeScenePoses,
  type NativeMeshGraph,
} from '../src/game/native-mesh';

it('samples the fill range of each Elixir Storage export in the shared atlas', () => {
  const { scenes } = JSON.parse(
    readFileSync('public/assets/village-native/elixirstorage/graph.json', 'utf8'),
  ) as { scenes: { buildings: NativeMeshGraph } };
  const graph = scenes.buildings;
  for (let level = 1; level <= 19; level++) {
    const body = `elixir_storage_level${level}`;
    expect(nativeResourceFrames(graph, body)).toBe(level >= 2 && level <= 4 ? 100 : 141);
  }
  expect(nativeResourceFrames(graph, 'elixir_storage_lvl2_base')).toBe(0);
  const sample = (frame: number) =>
    nativeScenePoses(graph, 'elixir_storage_level2', 0, { resource: frame });
  expect(sample(140)).toEqual(sample(40));
  expect(sample(nativeResourceFrames(graph, 'elixir_storage_level2') - 1)).not.toEqual(sample(40));
});

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
