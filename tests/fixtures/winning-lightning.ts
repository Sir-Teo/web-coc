import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { replayBattle, type ReplayData } from '../../src/game/replay';

/** A source Lightning pulse destroys the complete two-defense layout on its finishing sample. */
export function winningLightningBattle() {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.king = undefined;
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'cannon', 20, 10, 1),
    makeBuilding(2, 'archertower', 23, 10, 1),
  ];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), lightning: 1 };
  model.state.spellLevels = { ...defaultSpellLevels(), lightning: 13 };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [];
  const battle = (model.battle = replayBattle(data.initial));
  model.activeSpell = 'lightning';
  if (!model.castSpell(23, 11.5)) throw Error('Winning Lightning cast failed');
  const cast = battle.nativeSpellCastHistory![0];
  const finish = () => {
    for (let n = 0; n < 100 && !battle.finished; n++) model.step(0.05);
    if (!battle.finished || battle.destruction !== 100) throw Error('Lightning did not win');
    return {
      battle: JSON.parse(JSON.stringify(battle)),
      data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
      at: cast.firstHit,
    };
  };
  return { model, battle, cast, finish };
}

export function winningLightningRecording() {
  return winningLightningBattle().finish();
}
