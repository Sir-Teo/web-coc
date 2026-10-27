import { emptyArmy, emptySpells } from '../../src/game/army';
import { campaignStage } from '../../src/game/campaign-catalog';
import { campaignResources } from '../../src/game/campaign-loot';
import { GameModel, makeBuilding, type Battle } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

export function attackingBowlerBattle(level = 1, version = REPLAY_VERSION, x = 11.4) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 100;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'goldstorage', 13, 10, 18),
  ];
  model.state.army = { ...emptyArmy(), bowler: 1, archer: 1 };
  model.state.troopLevels = { ...model.state.troopLevels, bowler: level };
  model.state.spells = emptySpells();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [];
  data.initial.catalog = 'goblin-v1';
  data.initial.practice = false;
  data.initial.availableLoot = campaignResources(campaignStage(0, 'goblin-v1'));
  data.initial.lootRoom = { ...data.initial.availableLoot };
  const battle = (model.battle = replayBattle(data.initial, version));
  model.activeHero = false;
  model.activeHeroKind = null;
  model.activeTroop = 'bowler';
  if (!model.deploy(x, 11.5)) throw Error('Bowler deployment failed');
  const unit = battle.units[0];
  const step = () => {
    if (battle.finished || battle.elapsed > 20) throw Error('Attacking Bowler checkpoint missing');
    model.step(0.05);
  };
  const until = (at: number) => {
    while (battle.elapsed < at - 1e-9) step();
  };
  const untilAttacks = (count: number) => {
    while ((unit.native?.attacks ?? 0) < count) step();
  };
  return { model, battle, unit, data, step, until, untilAttacks };
}

export function attackingBowlerRecording(version = REPLAY_VERSION, x = 11.4) {
  const r = attackingBowlerBattle(1, version, x),
    snapshots: { at: number; battle: Battle }[] = [];
  const snapshot = () => {
    snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  while (!r.unit.attacking) r.step();
  const engaged = snapshot();
  r.untilAttacks(1);
  const first = snapshot(),
    shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id && !p.native?.bounce)!;
  r.until(shot.impact + 0.1);
  const landed = snapshot();
  r.untilAttacks(2);
  const second = snapshot();
  r.untilAttacks(3);
  const third = snapshot();
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    engaged,
    first,
    landed,
    second,
    third,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
