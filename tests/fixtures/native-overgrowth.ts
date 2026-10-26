import { GameModel, makeBuilding } from '../../src/game/model';
import { emptyArmy, emptySpells } from '../../src/game/army';
import { replayBattle, type ReplayData } from '../../src/game/replay';
/** Actual spell roots one building of each original footprint, then naturally expires. */
export function nativeOvergrowthRecording(level = 1) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 1),
    makeBuilding(2, 'builder', 10, 10, 1),
    makeBuilding(3, 'goldstorage', 14, 10, 15),
    makeBuilding(4, 'townhall', 18, 10, 1),
  ];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), overgrowth: 1 };
  model.state.spellLevels = { ...model.state.spellLevels, overgrowth: level };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [];
  const battle = (model.battle = replayBattle(data.initial)),
    snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  const step = () => {
    if (battle.finished || battle.elapsed > 35) throw Error('Overgrowth checkpoint missing');
    model.step(0.05);
  };
  const run = (at: number) => {
    while (battle.elapsed < at - 1e-9) step();
  };
  model.activeSpell = 'overgrowth';
  if (!model.castSpell(16, 11)) throw Error('Overgrowth cast failed');
  run(1.45);
  const falling = battle.elapsed;
  snapshot();
  run(1.8);
  const growing = battle.elapsed;
  snapshot();
  const roots = structuredClone(battle.nativeOvergrowthRoots!);
  if (roots?.length !== 3) throw Error('Three original root sizes missing');
  run(3);
  const deployed = battle.elapsed;
  snapshot();
  run(12);
  const steady = battle.elapsed;
  snapshot();
  const until = roots[0].until;
  run(until - 0.05);
  const before = battle.elapsed;
  snapshot();
  run(until);
  const expiring = battle.elapsed;
  snapshot();
  run(until + 0.2);
  const retracting = battle.elapsed;
  snapshot();
  run(until + 0.85);
  const after = battle.elapsed;
  snapshot();
  step();
  model.finishBattle();
  return {
    level,
    falling,
    growing,
    deployed,
    steady,
    before,
    expiring,
    retracting,
    after,
    until,
    roots,
    anchor: { x: 15.5, y: 11.5 },
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
