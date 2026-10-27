import { superLevelOffset } from '../../src/game/special-troops';
import { GameModel, makeBuilding } from '../../src/game/model';
import { emptyArmy, emptySpells } from '../../src/game/army';
import { replayBattle, type ReplayData } from '../../src/game/replay';

/** A defending Queen wounds a real Super Yeti, whose first Electromite casts a three-target arc. */
export function nativeElectromiteRecording(level = 1) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 1),
    makeBuilding(2, 'cannon', 9, 5, 21),
    makeBuilding(3, 'goldstorage', 5, 5, 15),
  ];
  model.state.army = { ...emptyArmy(), superyeti: 1, giant: 1 };
  model.state.spells = emptySpells();
  model.state.troopLevels = {
    ...model.state.troopLevels,
    superyeti: level,
    yeti: level + superLevelOffset('superyeti'),
  };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [];
  data.initial.defendingHeroes = [{ kind: 'queen', level: 50, x: 8.5, y: 8.5 }];
  const battle = (model.battle = replayBattle(data.initial));
  const step = () => {
    if (battle.finished || battle.elapsed > 20)
      throw Error(`Electromite chain checkpoint missing at ${battle.elapsed}`);
    model.step(0.05);
  };
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () => ({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  model.activeTroop = 'superyeti';
  if (!model.deploy(14.5, 6.5)) throw Error('Super Yeti deployment failed');
  const parentId = battle.units.at(-1)!.id;
  let child;
  while (
    !(child = battle.units.find((u) => u.kind === 'electromite' && u.native?.owner === parentId))
  )
    step();
  if ((battle.units.find((u) => u.id === parentId)?.hp ?? 0) <= 0)
    throw Error('Electromite did not spawn while its wounded parent was alive');
  if (child.level !== level)
    throw Error(`Electromite tier ${child.level} did not match parent ${level}`);
  const childId = child.id,
    spawned = battle.elapsed;
  snapshots.push(snapshot());
  let before = snapshot();
  const zaps = () => battle.nativeElectromiteZaps?.filter((z) => z.sourceId === childId) ?? [];
  while (zaps().length < 1) {
    before = snapshot();
    step();
  }
  const first = battle.elapsed;
  snapshots.push(before, snapshot());
  if (!child.spent || child.native?.attacks !== 1)
    throw Error('Electromite was not consumed by its cast');
  step();
  const visible = battle.elapsed;
  snapshots.push(snapshot());
  while (zaps().length < 2) step();
  const second = battle.elapsed;
  snapshots.push(snapshot());
  while (zaps().length < 3) step();
  const third = battle.elapsed;
  snapshots.push(snapshot());
  const targets = zaps().map((z) => ({
    id: z.targetId,
    building: z.targetBuilding,
    at: z.at,
    key: z.key,
  }));
  step();
  model.finishBattle();
  return {
    level,
    parentId,
    childId,
    spawned,
    before: before.at,
    first,
    visible,
    second,
    third,
    targets,
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
