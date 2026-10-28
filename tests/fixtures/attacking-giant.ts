import { emptyArmy, emptySpells } from '../../src/game/army';
import { campaignStage } from '../../src/game/campaign-catalog';
import { campaignResources } from '../../src/game/campaign-loot';
import { GameModel, makeBuilding, type Battle } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';
import { superLevelOffset } from '../../src/game/special-troops';

export function attackingGiantBattle(
  level = 1,
  version = REPLAY_VERSION,
  x = 11.4,
  superTroop = false,
  defense = false,
) {
  const kind = superTroop ? 'supergiant' : 'giant';
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 100;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 1),
    makeBuilding(2, defense ? 'cannon' : 'goldstorage', 13, 10, defense ? 6 : 18),
  ];
  model.state.army = { ...emptyArmy(), [kind]: 1, archer: 1 };
  model.state.troopLevels = {
    ...model.state.troopLevels,
    giant: level + (superTroop ? superLevelOffset('supergiant') : 0),
    [kind]: level,
  };
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
  model.activeTroop = kind;
  if (!model.deploy(x, 11.5)) throw Error('Giant fixture deployment failed');
  const unit = battle.units[0];
  const step = () => {
    if (battle.finished || battle.elapsed > 35) throw Error('Giant checkpoint missing');
    model.step(0.05);
  };
  const until = (at: number) => {
    while (battle.elapsed < at - 1e-9) step();
  };
  const untilAttacks = (count: number) => {
    while ((unit.native?.attacks ?? 0) < count) step();
  };
  return { model, battle, unit, data, kind, step, until, untilAttacks };
}

/** Portable cases use ordinary deployments and a live Cannon, with no injected status state. */
export function attackingGiantRecording(
  version = REPLAY_VERSION,
  x = 11.4,
  level = 1,
  superTroop = false,
) {
  const r = attackingGiantBattle(level, version, x, superTroop, true),
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
  if (version >= 171) {
    r.until(engaged + 0.7);
    charged = snapshot();
    r.untilAttacks(1);
  }
  const first = snapshot(),
    hp = target.hp;
  r.until(first + 0.2);
  const recovery = snapshot();
  if (version >= 171) r.untilAttacks(2);
  else while (target.hp === hp) r.step();
  const second = snapshot();
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    born,
    engaged,
    charged,
    first,
    recovery,
    second,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
