import { GameModel, makeBuilding } from '../../src/game/model';
import { emptyArmy, emptySpells } from '../../src/game/army';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';
import { spellEndTime } from '../../src/game/native-spells';
/** Real Giant deployment and Clone input; copies keep their source housing and deadlines. */
export function nativeCloneSpellRecording(level = 1, version = REPLAY_VERSION) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 1),
    makeBuilding(2, 'goldstorage', 30, 36, 15),
  ];
  model.state.army = { ...emptyArmy(), giant: 1, archer: 1 };
  model.state.spells = { ...emptySpells(), clone: 1 };
  model.state.spellLevels = { ...model.state.spellLevels, clone: level };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [];
  const battle = (model.battle = replayBattle(data.initial, version)),
    snapshots: { at: number; battle: unknown }[] = [];
  const step = () => {
    if (battle.finished || battle.elapsed > 40) throw Error('Clone checkpoint missing');
    model.step(0.05);
  };
  const snapshot = (at: number) => {
    while (battle.elapsed < at - 1e-9) step();
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
    return battle.elapsed;
  };
  model.activeTroop = 'giant';
  if (!model.deploy(5, 5)) throw Error('Clone Giant deployment failed');
  step();
  const original = battle.units[0];
  model.activeSpell = 'clone';
  if (!model.castSpell(original.x, original.y)) throw Error('Clone input failed');
  const cast = battle.nativeSpells![0],
    first = cast.firstHit;
  const before = snapshot(first - 0.05),
    copied = snapshot(first),
    later = snapshot(first + 0.9),
    copies = battle.units.filter((u) => u.native?.cloneUntil !== undefined);
  if (!copies.length) throw Error('Clone made no actual copies');
  const copyIds = copies.map((u) => u.id),
    deadline = Math.max(...copies.map((u) => u.native!.cloneUntil!));
  const afterLive = snapshot(spellEndTime(cast) + 0.15),
    expired = snapshot(deadline + 0.05);
  if (battle.units.some((u) => copyIds.includes(u.id) && u.hp > 0))
    throw Error('Clone copies survived their deadlines');
  step();
  model.finishBattle();
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
    level,
    snapshots,
    originalId: original.id,
    copyIds,
    before,
    copied,
    later,
    afterLive,
    expired,
  };
}
