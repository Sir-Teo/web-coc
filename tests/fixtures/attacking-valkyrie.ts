import { emptyArmy, emptySpells } from '../../src/game/army';
import { campaignStage } from '../../src/game/campaign-catalog';
import { campaignResources } from '../../src/game/campaign-loot';
import { GameModel, makeBuilding, type Battle } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

export function attackingValkyrieBattle(
  level = 1,
  version = REPLAY_VERSION,
  x = 11.4,
  superTroop = false,
  garrison = false,
) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 100;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, garrison ? 'clancastle' : 'goldstorage', 13, 10, garrison ? 9 : 18),
  ];
  model.state.army = {
    ...emptyArmy(),
    valkyrie: superTroop ? 0 : 1,
    supervalkyrie: superTroop ? 1 : 0,
    archer: 1,
  };
  model.state.troopLevels = { ...model.state.troopLevels, valkyrie: level, supervalkyrie: level };
  model.state.spells = emptySpells();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [];
  data.initial.catalog = 'goblin-v1';
  data.initial.practice = false;
  data.initial.availableLoot = campaignResources(campaignStage(0, 'goblin-v1'));
  data.initial.lootRoom = { ...data.initial.availableLoot };
  if (garrison)
    data.initial.garrisons = [
      { castleId: 2, mode: 'guard', troops: [{ kind: 'golem', level: 8, count: 1 }] },
    ];
  const battle = (model.battle = replayBattle(data.initial, version));
  model.activeHero = false;
  model.activeHeroKind = null;
  model.activeTroop = superTroop ? 'supervalkyrie' : 'valkyrie';
  if (!model.deploy(x, 11.5)) throw Error('Valkyrie fixture deployment failed');
  const step = () => {
    if (battle.finished || battle.elapsed > 35) throw Error('Valkyrie checkpoint missing');
    model.step(0.05);
  };
  const unit = battle.units[0];
  const until = (at: number) => {
    while (battle.elapsed < at - 1e-9) step();
  };
  const untilAttacks = (n: number) => {
    while ((unit.native?.attacks ?? 0) < n) step();
  };
  return { model, battle, unit, data, step, until, untilAttacks };
}
/** Ordinary deployment with optional real Castle release; no injected combat/status state. */
export function attackingValkyrieRecording(
  version = REPLAY_VERSION,
  x = 11.4,
  level = 1,
  superTroop = false,
  garrison = false,
) {
  const r = attackingValkyrieBattle(level, version, x, superTroop, garrison),
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
  if (version >= 165) {
    r.until(engaged + 0.1);
    charged = snapshot();
    r.untilAttacks(1);
  }
  const first = snapshot(),
    hp = JSON.stringify([target.hp, r.battle.defenders?.map((d) => d.hp)]);
  if (version >= 165) r.untilAttacks(2);
  else {
    while (JSON.stringify([target.hp, r.battle.defenders?.map((d) => d.hp)]) === hp) r.step();
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
