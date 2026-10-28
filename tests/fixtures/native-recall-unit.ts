import { GameModel, makeBuilding } from '../../src/game/model';
import { emptyArmy, emptySpells } from '../../src/game/army';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';
/** Cannon wounds, Freeze, Recall and redeployment are all actual inputs. */
export function nativeRecallUnitRecording(redeployDelay = 0, version = REPLAY_VERSION) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 1),
    makeBuilding(2, 'cannon', 10, 10, 1),
  ];
  model.state.army = { ...emptyArmy(), giant: 1, archer: 1 };
  model.state.spells = { ...emptySpells(), freeze: 1, recall: 1 };
  model.state.spellLevels = { ...model.state.spellLevels, freeze: 8, recall: 7 };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [];
  const battle = (model.battle = replayBattle(data.initial, version)),
    snapshots: { at: number; battle: unknown }[] = [];
  const step = () => {
    if (battle.finished || battle.elapsed > 50) throw Error('Recall unit checkpoint missing');
    model.step(0.05);
  };
  const until = (at: number) => {
    while (battle.elapsed < at - 1e-9) step();
  };
  const snapshot = (at: number) => {
    until(at);
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
    return battle.elapsed;
  };
  model.activeTroop = 'giant';
  if (!model.deploy(5, 10)) throw Error('Giant deploy failed');
  const unit = battle.units[0],
    oldId = unit.id;
  while (unit.hp === unit.maxHp) step();
  model.activeSpell = 'freeze';
  if (!model.castSpell(11.5, 11.5)) throw Error('Freeze failed');
  until(battle.nativeSpells!.find((c) => c.name === 'Freeze')!.firstHit + 0.1);
  model.activeSpell = 'recall';
  if (!model.castSpell(unit.x, unit.y)) throw Error('Recall failed');
  const cast = battle.nativeSpells!.find((c) => c.name === 'Recall')!,
    before = snapshot(cast.firstHit - 0.05),
    disappeared = snapshot(cast.firstHit + 0.05),
    wave = snapshot(cast.firstHit + 0.25),
    hp = battle.recalledHp!.giant![0];
  until(battle.elapsed + redeployDelay);
  step();
  model.activeTroop = 'giant';
  if (!model.deploy(5, 15)) throw Error('Recalled Giant redeploy failed');
  const newId = battle.units.find((u) => u.kind === 'giant')!.id,
    arrived = battle.elapsed;
  if (battle.units.find((u) => u.id === newId)!.hp !== hp) throw Error('Recalled health changed');
  const returning = snapshot(arrived + 0.15),
    steady = snapshot(arrived + 0.7),
    tail = snapshot(arrived + 5.8),
    retired = snapshot(arrived + 6.2),
    forgotten = snapshot(arrived + 10.2);
  step();
  model.finishBattle();
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
    snapshots,
    oldId,
    newId,
    hp,
    before,
    disappeared,
    wave,
    arrived,
    returning,
    steady,
    tail,
    retired,
    forgotten,
  };
}
