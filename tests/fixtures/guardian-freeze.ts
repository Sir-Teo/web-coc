import { emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import type { GuardianDefender } from '../../src/game/defenders';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

export function guardianFreezeBattle(version = REPLAY_VERSION) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    { ...makeBuilding(1, 'townhall', 22, 22, 18), guardian: 'longshot' },
    makeBuilding(2, 'goldmine', 44, 44),
  ];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), golem: 2 };
  model.state.spells = { ...emptySpells(), freeze: 1 };
  model.startBattle(0, true);
  const recording = (model as unknown as { recording: ReplayData }).recording;
  if (version !== recording.version) {
    recording.version = version;
    model.battle = replayBattle(recording.initial, version);
  }
  const battle = model.battle!;
  const until = (seconds: number) => {
    while (battle.elapsed < seconds - 1e-9) {
      if (battle.finished) throw Error('Guardian fixture ended early');
      model.step(0.05);
    }
  };
  model.activeSpell = 'freeze';
  if (!model.castSpell(24, 24)) throw Error('Guardian Freeze cast failed');
  until(1.6);
  const guardian = battle.defenders!.find((d): d is GuardianDefender => d.kind === 'guardian')!;
  model.activeTroop = 'golem';
  if (!model.deploy(14, 24)) throw Error('Guardian fixture deployment failed');
  return { model, battle, guardian, until };
}
