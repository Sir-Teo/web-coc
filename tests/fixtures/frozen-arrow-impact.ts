import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { replayBattle, type ReplayData } from '../../src/game/replay';
import type { HeroItemSetup } from '../../src/game/native-heroes';

export function frozenArrowBattle(items: HeroItemSetup[] = [{ slug: 'frozen-arrow', level: 1 }]) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'cannon', 12, 10, 1),
  ];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), recall: 1 };
  model.state.spellLevels = defaultSpellLevels();
  model.state.king = undefined;
  model.startBattle(0, true);
  const recording = (model as unknown as { recording: ReplayData }).recording;
  recording.initial.heroes = [{ kind: 'queen', level: 1, items }];
  model.battle = replayBattle(recording.initial);
  if (!model.deployNativeHero('queen', 6.9, 11.5))
    throw Error('Frozen Arrow Queen deployment failed');
  model.activeSpell = 'recall';
  if (!model.castSpell(6.9, 11.5)) throw Error('Queen Recall cast failed');
  const battle = model.battle;
  const queenId = battle.nativeHeroes![0].unitId!;
  return { model, battle, queenId };
}

/** Real Frozen Arrow shots, with the last shot landing after the Queen is recalled. */
export function frozenArrowRecording() {
  const { model, battle, queenId } = frozenArrowBattle();
  const until = (at: number) => {
    for (let remaining = 200; battle.elapsed < at - 1e-9; remaining--) {
      if (!remaining || battle.finished) throw Error('Frozen Arrow checkpoint was not reached');
      model.step(0.05);
    }
  };
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  until(0.15);
  snapshot();
  const flight = battle.elapsed;
  until(0.95);
  const shot = battle.projectiles!.find((projectile) => projectile.sourceId === queenId)!;
  if (!shot || shot.impact <= battle.elapsed)
    throw Error('Recall did not leave an arrow in flight');
  snapshot();
  const recalled = battle.elapsed;
  until(shot.impact + 0.05);
  snapshot();
  const hit = battle.elapsed;
  until(shot.impact + 0.75 + 0.1);
  snapshot();
  const expired = battle.elapsed;
  until(expired + 0.1);
  model.finishBattle();
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
    snapshots,
    flight,
    recalled,
    hit,
    expired,
    impact: shot.impact,
    queenId,
    cannonId: 2,
  };
}
