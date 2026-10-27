import { emptyArmy, emptySpells } from '../../src/game/army';
import { campaignStage } from '../../src/game/campaign-catalog';
import { campaignResources } from '../../src/game/campaign-loot';
import { GameModel, makeBuilding, type Battle } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

export function attackingPekkaBattle(level = 1, version = REPLAY_VERSION, x = 11.4, siege = false) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 100;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'goldstorage', 13, 10, 18),
  ];
  model.state.army = {
    ...emptyArmy(),
    pekka: siege ? 0 : 1,
    siegebarracks: siege ? 1 : 0,
    archer: 1,
  };
  model.state.troopLevels = { ...model.state.troopLevels, pekka: level, siegebarracks: 1 };
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
  model.activeTroop = siege ? 'siegebarracks' : 'pekka';
  if (!model.deploy(x, 11.5)) throw Error('Pekka fixture deployment failed');
  const step = () => {
    if (battle.finished || battle.elapsed > 35) throw Error('Pekka checkpoint missing');
    model.step(0.05);
  };
  if (siege) while (!battle.units.some((u) => u.kind === 'pekka')) step();
  const unit = battle.units.find((u) => u.kind === 'pekka')!;
  const until = (at: number) => {
    while (battle.elapsed < at - 1e-9) step();
  };
  const untilAttacks = (n: number) => {
    while ((unit.native?.attacks ?? 0) < n) step();
  };
  return { model, battle, unit, data, step, until, untilAttacks };
}
/** Ordinary deployment, or a real Siege Barracks release; no injected combat/status state. */
export function attackingPekkaRecording(
  version = REPLAY_VERSION,
  x = 11.4,
  level = 1,
  siege = false,
) {
  const r = attackingPekkaBattle(level, version, x, siege),
    snapshots: { at: number; battle: Battle }[] = [];
  const snapshot = () => {
    if (snapshots.at(-1)?.at !== r.battle.elapsed)
      snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  const born = snapshot();
  while (!r.unit.attacking) r.step();
  const engaged = snapshot(),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  let charged: number | undefined;
  if (version >= 164) {
    r.until(engaged + 0.7);
    charged = snapshot();
    r.untilAttacks(1);
  }
  const first = snapshot(),
    hp = target.hp;
  if (version >= 164) r.untilAttacks(2);
  else {
    while (target.hp === hp) r.step();
  }
  const second = snapshot();
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    born,
    engaged,
    charged,
    first,
    second,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
