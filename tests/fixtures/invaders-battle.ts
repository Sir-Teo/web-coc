import { emptySpells } from '../../src/game/army';
import { GameModel } from '../../src/game/model';
import { emptyArmy } from '../../src/game/army';
import { freshNativeCampaign } from '../../src/game/native-campaign';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';
import { developedSave } from './developed-village';

/** A legal 200-space TH8 army approaching Invaders' original level-three Bomb Tower. */
export function invadersVillage() {
  const save = developedSave();
  save.buildings.find((b) => b.kind === 'townhall')!.level = 8;
  save.buildings.find((b) => b.kind === 'barracks')!.level = 10;
  save.army = { ...emptyArmy(), giant: 8, dragon: 8 };
  save.king = undefined;
  save.spells = {
    ...emptySpells(),
    lightning: 0,
    heal: 0,
    rage: 0,
    freeze: 0,
    invisibility: 0,
    jump: 0,
    clone: 0,
    recall: 0,
    revive: 0,
  };
  save.nativeCampaign = freshNativeCampaign();
  save.nativeCampaign.stars[49] = 1;
  save.tutorial = true;
  return new GameModel(save).state;
}
export function deployInvaders(model: GameModel) {
  for (const kind of ['giant', 'dragon'] as const) {
    model.activeTroop = kind;
    while (model.battle!.remaining[kind])
      if (!model.deploy(6, 23.5)) throw Error('Invaders fixture deployment failed');
  }
}
export function invadersBattle(model = new GameModel(invadersVillage()), version = REPLAY_VERSION) {
  model.startCampaign(50);
  if (!model.battle) throw Error('Invaders did not open');
  if (version !== REPLAY_VERSION) {
    const data = (model as unknown as { recording: ReplayData }).recording;
    data.version = version;
    model.battle = replayBattle(data.initial, version);
  }
  deployInvaders(model);
  return model;
}
