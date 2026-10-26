import { GameModel, makeBuilding } from '../../src/game/model';
import { emptyArmy, emptySpells } from '../../src/game/army';
import { replayBattle, type ReplayData } from '../../src/game/replay';
import { superLevelOffset } from '../../src/game/special-troops';
/** Real deployed archer; its fixed arrow crosses structures before/after a storage or Queen aim. */
export function nativeSuperArcherRecording(
  level = 1,
  mode: 'buildings' | 'defender' = 'buildings',
) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 1),
    ...Array.from({ length: 3 }, (_, i) => makeBuilding(2 + i, 'goldstorage', 7 + 4 * i, 5, 15)),
    makeBuilding(5, 'elixirstorage', 11, 11, 15),
  ];
  model.state.army = { ...emptyArmy(), superarcher: 1, giant: 1 };
  model.state.spells = emptySpells();
  model.state.troopLevels = {
    ...model.state.troopLevels,
    superarcher: level,
    archer: level + superLevelOffset('superarcher'),
  };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [];
  if (mode === 'defender')
    data.initial.defendingHeroes = [{ kind: 'queen', level: 1, x: 8.5, y: 9.5 }];
  const battle = (model.battle = replayBattle(data.initial)),
    snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  const step = () => {
    if (battle.finished || battle.elapsed > 3) throw Error('Archer checkpoint missing');
    model.step(0.05);
  };
  model.activeTroop = 'superarcher';
  if (!model.deploy(5, 6.5)) throw Error('Super Archer deployment failed');
  while (!battle.nativeArcherShots?.length) step();
  const shot = battle.nativeArcherShots[0],
    sourceId = shot.sourceId,
    launched = shot.launched;
  if (shot.level !== level) throw Error('Incorrect derived archer tier');
  snapshot();
  step();
  const flight = battle.elapsed;
  snapshot();
  while (!shot.hit.length) step();
  const first = battle.elapsed;
  snapshot();
  const aimLength = shot.length - 4;
  while (shot.travelled < aimLength + 0.5) step();
  const passedPrimary = battle.elapsed;
  snapshot();
  while (shot.travelled < shot.length - 1e-9) step();
  const landed = battle.elapsed;
  snapshot();
  if (shot.hit.length < 2) throw Error('Archer did not pierce a second target');
  const hits = structuredClone(shot.hit),
    impact = shot.launched + shot.length / shot.speed;
  if (mode === 'defender' && !hits.some((h) => !h.target.building))
    throw Error('Queen was not struck');
  step();
  const after = battle.elapsed;
  snapshot();
  step();
  model.finishBattle();
  return {
    level,
    mode,
    sourceId,
    shotId: shot.id,
    launched,
    flight,
    first,
    passedPrimary,
    landed,
    after,
    impact,
    hits,
    anchor: {
      x: shot.fromX + (shot.dirX * shot.length) / 2,
      y: shot.fromY + (shot.dirY * shot.length) / 2,
    },
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
