import { GameModel, makeBuilding } from '../../src/game/model';
import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { distance2D } from '../../src/game/distance';
import { replayBattle, type ReplayData } from '../../src/game/replay';

/** A released Dragon defeats a real Giant, then leaves Poison after its target is gone. */
export function poisonAvoidanceRecording() {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'clancastle', 20, 20, 8),
  ];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), giant: 2 };
  model.state.troopLevels = { ...model.state.troopLevels, giant: 1 };
  model.state.spells = { ...emptySpells(), poison: 1 };
  model.state.spellLevels = { ...defaultSpellLevels(), poison: 1 };
  model.state.king = undefined;
  model.startBattle(0, true);
  const recording = (model as unknown as { recording: ReplayData }).recording;
  recording.initial.garrisons = [
    { castleId: 2, mode: 'guard', troops: [{ kind: 'dragon', level: 5, count: 1 }] },
  ];
  model.battle = replayBattle(recording.initial);
  const battle = model.battle;
  const until = (ready: () => boolean) => {
    for (let remaining = 600; !ready(); remaining--) {
      if (!remaining || battle.finished) throw Error('Poison avoidance checkpoint not reached');
      model.step(0.05);
    }
  };
  model.activeTroop = 'giant';
  if (!model.deploy(16, 21)) throw Error('Giant deployment failed');
  until(
    () =>
      !!battle.defenders?.some((defender) => defender.kind === 'dragon') &&
      battle.units.every((unit) => unit.hp <= 0),
  );
  const defender = battle.defenders!.find((defender) => defender.kind === 'dragon')!;
  const cloud = { x: defender.x, y: defender.y, radius: 4 };
  model.activeSpell = 'poison';
  if (!model.castSpell(cloud.x, cloud.y)) throw Error('Poison cast failed');
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  snapshot();
  const before = battle.elapsed;
  const cast = battle.nativeSpells!.find((spell) => spell.name === 'Poison')!;
  until(() => battle.elapsed >= cast.firstHit + 0.3);
  snapshot();
  const avoiding = battle.elapsed;
  until(() => distance2D(defender.x - cloud.x, defender.y - cloud.y) > cloud.radius);
  model.step(0.05);
  model.step(0.05);
  snapshot();
  const escaped = battle.elapsed;
  for (let i = 0; i < 10; i++) model.step(0.05);
  model.finishBattle();
  const data = JSON.parse(JSON.stringify(model.state.raidLog![0].replay!));
  return { data, snapshots, before, avoiding, escaped, cloud, defenderId: defender.id };
}
