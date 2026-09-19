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
    // Strip every rule flag newer than version 51 so unrecorded battles match it too.
    delete model.battle.nativeContentExpansion;
    delete model.battle.nativeHeroPassives;
    delete model.battle.separationCap;
    delete model.battle.stalledSupportEnds;
    delete model.battle.dropFallenPaths;
    model.battle.defenders = model.battle.defenders?.filter((d) => d.kind !== 'hero');
  }
}
export class ReleasedGameModel extends GameModel {
  override startBattle(...args: Parameters<GameModel['startBattle']>) {
    super.startBattle(...args);
    useReleasedCombat(this);
  }
}
