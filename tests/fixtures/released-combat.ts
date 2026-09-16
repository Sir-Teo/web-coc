import { GameModel } from '../../src/game/model';
import { replayBattle, type ReplayData } from '../../src/game/replay';
/** Keep the released immediate-spell regression suite exercising replay version 51. */
export function useReleasedCombat(model: GameModel) {
  const recording = (model as unknown as { recording: ReplayData | null }).recording;
  if (!model.battle) return;
  if (recording) {
    recording.version = 51;
    delete recording.initial.defendingHeroes;
    model.battle = replayBattle(recording.initial, 51);
  } else {
    delete model.battle.nativeContentExpansion;
    model.battle.defenders = model.battle.defenders?.filter((d) => d.kind !== 'hero');
  }
}
export class ReleasedGameModel extends GameModel {
  override startBattle(...args: Parameters<GameModel['startBattle']>) {
    super.startBattle(...args);
    useReleasedCombat(this);
  }
}
