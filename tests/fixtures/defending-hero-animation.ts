import { emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { replayBattle, type ReplayData } from '../../src/game/replay';

/** Two real stationary Heroes trading hits, exposing the defender's first and repeat windup. */
export function defendingHeroAnimationRecording(kind: 'king' | 'queen') {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
  model.state.nextId = 1000;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = emptySpells();
  model.state.king = undefined;
  model.startBattle(0, true);
  const recording = (model as unknown as { recording: ReplayData }).recording;
  recording.initial.defendingHeroes = [{ kind, level: 1, x: 7.5, y: 5 }];
  recording.initial.heroes = [{ kind: 'king', level: 1, items: [] }];
  model.battle = replayBattle(recording.initial);
  const battle = model.battle;
  const defenderId = battle.defenders!.find((d) => d.kind === 'hero')!.id;
  const hits: number[] = [];
  model.onEffect = (effect) => {
    if (effect.type === 'hit' && effect.sourceId === defenderId) hits.push(battle.elapsed);
  };
  if (!model.deployNativeHero('king', 7.6, 5)) throw Error('Animation opponent deployment failed');
  for (let remaining = 60; battle.elapsed < 2.1 - 1e-9; remaining--) {
    if (!remaining || battle.finished) throw Error('Defending Hero animation fixture ended early');
    model.step(0.05);
  }
  if (hits.length < 2) throw Error('Defending Hero did not attack twice');
  // Combat carries a sub-step cooldown overshoot into the next interval. Stay clear of
  // the Queen's first 125 ms atlas boundary even when the initial hit carries 50 ms.
  const phase = kind === 'king' ? 0.45 : 0.05;
  const first = Math.round((hits[0] + phase) * 20) / 20;
  const repeat = Math.round((hits[1] + phase) * 20) / 20;
  model.finishBattle();
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
    defenderId,
    first,
    repeat,
    frame: kind === 'king' ? 2 : 0,
  };
}
