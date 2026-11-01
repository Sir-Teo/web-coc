import { emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding, type Battle } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

export function attackingBearSetup(
  level = 1,
  version = REPLAY_VERSION,
  x = 11.4,
  target: 'storage' | 'airdefense' | 'cannon' = 'storage',
) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 100;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 1),
    makeBuilding(
      2,
      target === 'storage' ? 'goldstorage' : target,
      13,
      10,
      target === 'storage' ? 18 : 12,
    ),
  ];
  model.state.army = { ...emptyArmy(), druid: 1, archer: 2 };
  model.state.troopLevels = { ...model.state.troopLevels, druid: level };
  model.state.spells = emptySpells();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [];
  const battle = (model.battle = replayBattle(data.initial, version));
  model.activeTroop = 'druid';
  if (!model.deploy(x, 11.5)) throw Error('Bear parent deployment failed');
  const druid = battle.units.at(-1)!;
  const step = () => {
    if (battle.finished || battle.elapsed > 60) throw Error('Bear checkpoint expired');
    model.step(0.05);
  };
  const until = (at: number) => {
    while (battle.elapsed < at - 1e-9) step();
  };
  return { model, battle, druid, data, step, until };
}

/** Controlled transformation isolates melee timing without a thirty-second wait in every case. */
export function attackingBearBattle(
  level = 1,
  version = REPLAY_VERSION,
  x = 11.4,
  defense = false,
) {
  const r = attackingBearSetup(level, version, x, defense ? 'airdefense' : 'storage');
  r.druid.spawnedAt = -30;
  r.step();
  if (r.druid.kind !== 'bear') throw Error('Controlled Bear transformation failed');
  const unit = r.druid;
  const untilAttacks = (count: number) => {
    while ((unit.native?.attacks ?? 0) < count) r.step();
  };
  return { ...r, unit, untilAttacks };
}

/** Only real inputs: either natural evolution or Cannon defeat creates the Bear. */
export function attackingBearRecording(
  level = 1,
  version = REPLAY_VERSION,
  death = false,
  x = 11.4,
) {
  const r = attackingBearSetup(level, version, x, death ? 'cannon' : 'airdefense'),
    snapshots: { at: number; battle: Battle }[] = [];
  const snapshot = () => {
    if (snapshots.at(-1)?.at !== r.battle.elapsed)
      snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  const born = snapshot();
  while (!r.battle.units.some((u) => u.kind === 'bear')) r.step();
  const unit = r.battle.units.find((u) => u.kind === 'bear')!;
  const transformed = snapshot();
  while (!unit.attacking) r.step();
  const engaged = snapshot();
  while (!(unit.native?.attacks ?? 0)) r.step();
  const first = snapshot();
  while ((unit.native?.attacks ?? 0) < 2) r.step();
  const second = snapshot();
  r.step();
  r.model.finishBattle();
  return {
    id: unit.id,
    parentId: r.druid.id,
    born,
    transformed,
    engaged,
    first,
    second,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
