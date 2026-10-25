import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { replayBattle, type ReplayData } from '../../src/game/replay';
import type { CombatProjectile } from '../../src/game/projectiles';

/** Real Queen hits with the final arrow still in flight when Recall removes her. */
export function defenderFrostRecording(air = false, level = 1) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
  model.state.nextId = 1000;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), recall: 1 };
  model.state.spellLevels = defaultSpellLevels();
  model.state.king = undefined;
  model.startBattle(0, true);
  const recording = (model as unknown as { recording: ReplayData }).recording;
  recording.initial.defendingHeroes = [
    { kind: air ? 'prince' : 'king', level: air ? 95 : 110, x: 10, y: 5 },
  ];
  recording.initial.heroes = [
    { kind: 'queen', level: 100, items: [{ slug: 'frozen-arrow', level }] },
  ];
  model.battle = replayBattle(recording.initial);
  const battle = model.battle;
  if (!model.deployNativeHero('queen', 5, 5)) throw Error('Frost Queen deployment failed');
  const queenId = battle.nativeHeroes![0].unitId!;
  const defender = battle.defenders!.find((d) => d.kind === 'hero')!;
  const shots: CombatProjectile[] = [];
  model.onEffect = (effect) => {
    if (effect.type === 'projectile' && effect.sourceId === queenId)
      shots.push(
        JSON.parse(JSON.stringify(battle.projectiles!.find((p) => p.id === effect.projectileId)!)),
      );
  };
  model.activeSpell = 'recall';
  if (!model.castSpell(5, 5)) throw Error('Frost Queen Recall failed');
  const recallAt = battle.nativeSpells!.find((cast) => cast.name === 'Recall')!.firstHit;
  const until = (at: number) => {
    for (let remaining = 200; battle.elapsed < at - 1e-9; remaining--) {
      if (!remaining || battle.finished) throw Error('Defender frost checkpoint was not reached');
      model.step(0.05);
    }
  };
  for (let remaining = 100; !shots.length; remaining--) {
    if (!remaining || battle.finished) throw Error('Frost Queen did not fire');
    model.step(0.05);
  }
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  until(shots[0].launched + 0.05);
  snapshot();
  const flight = battle.elapsed;
  until(shots[0].impact + 0.05);
  snapshot();
  const hit = battle.elapsed;
  until(recallAt + 0.05);
  snapshot();
  const recalled = battle.elapsed;
  const last = shots.at(-1)!;
  until(last.impact + 0.05);
  snapshot();
  const finalHit = battle.elapsed;
  const deadline = last.impact + last.native!.frost!.seconds;
  until(deadline + 0.1);
  snapshot();
  const expired = battle.elapsed;
  until(expired + 0.1);
  model.finishBattle();
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
    snapshots,
    queenId,
    defenderId: defender.id,
    shots,
    recallAt,
    flight,
    hit,
    recalled,
    finalHit,
    expired,
    deadline,
  };
}
