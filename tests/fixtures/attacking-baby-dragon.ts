import { GameModel, makeBuilding, type Battle } from '../../src/game/model';
import { emptyArmy } from '../../src/game/army';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';
import { nativeDirectRecording } from './native-direct-attacks';

export const babyDragonRecording = (
  version = REPLAY_VERSION,
  level = 1,
  guard: boolean | 'air' = false,
) => nativeDirectRecording('babydragon', 186, version, level, guard, 0.25);

/** A real Minion deployment cancels Tantrum while the first captured shot is in flight. */
export function babyDragonAllyRecording(level = 1, version = REPLAY_VERSION) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 100;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 1),
    makeBuilding(2, 'cannon', 13, 10, 21),
  ];
  model.state.army = { ...emptyArmy(), babydragon: 1, minion: 1, archer: 2 };
  model.state.troopLevels = { ...model.state.troopLevels, babydragon: level, minion: 1 };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  const battle = (model.battle = replayBattle(data.initial, version)),
    snapshots: { at: number; battle: Battle }[] = [];
  const step = () => {
    if (battle.finished || battle.elapsed > 15) throw Error('Baby Dragon ally checkpoint missing');
    model.step(0.05);
  };
  const until = (at: number) => {
    while (battle.elapsed < at - 1e-9) step();
  };
  const snapshot = () => {
    if (snapshots.at(-1)?.at !== battle.elapsed)
      snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
    return battle.elapsed;
  };
  model.activeTroop = 'babydragon';
  if (!model.deploy(11.4, 11.5)) throw Error('Baby Dragon deployment failed');
  const unit = battle.units.find((u) => u.kind === 'babydragon')!,
    born = snapshot();
  while (!(unit.native!.attacks ?? 0)) step();
  const first = snapshot(),
    shot = battle.projectiles!.find((p) => p.sourceId === unit.id)!,
    damage = shot.damage;
  step();
  model.activeTroop = 'minion';
  if (!model.deploy(10.4, 11.5)) throw Error('Baby Dragon companion deployment failed');
  const companion = battle.units.at(-1)!,
    joined = snapshot();
  until(joined + 0.2);
  const calm = snapshot();
  until(shot.impact + 0.05);
  const hit = snapshot();
  while ((unit.native!.attacks ?? 0) < 2) step();
  const second = snapshot();
  step();
  model.finishBattle();
  return {
    id: unit.id,
    companionId: companion.id,
    born,
    first,
    joined,
    calm,
    hit,
    second,
    damage,
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
