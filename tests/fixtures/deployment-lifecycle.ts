import { emptyArmy, emptySpells } from '../../src/game/army';
import { campaignStage } from '../../src/game/campaign-catalog';
import { campaignResources } from '../../src/game/campaign-loot';
import { BUILDINGS, type TroopKind } from '../../src/game/data';
import { GameModel, makeBuilding, type Battle } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

export type LifecycleKind = 'furnace' | 'siegebarracks' | 'druid';
export function deploymentLifecycleBattle(
  kind: LifecycleKind,
  level = 1,
  version = REPLAY_VERSION,
  delay = 10,
  research: Partial<Record<TroopKind, number>> = {},
) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 100;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    ...[12, 18, 24, 30].map((x, i) =>
      makeBuilding(i + 2, 'goldstorage', x, 36, BUILDINGS.goldstorage.maxLevel),
    ),
  ];
  model.state.army = { ...emptyArmy(), giant: 1, [kind]: 1, archer: 1 };
  model.state.troopLevels = { ...model.state.troopLevels, ...research, [kind]: level };
  model.state.spells = emptySpells();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [];
  // Valid campaign metadata avoids the Home Village Town Hall 18 Guardian.
  data.initial.catalog = 'goblin-v1';
  data.initial.practice = false;
  data.initial.availableLoot = campaignResources(campaignStage(0, 'goblin-v1'));
  data.initial.lootRoom = { ...data.initial.availableLoot };
  const battle = (model.battle = replayBattle(data.initial, version));
  model.activeHero = false;
  model.activeHeroKind = null;
  model.activeTroop = 'giant';
  if (!model.deploy(6.9, 11.5)) throw Error('Lifecycle starter deployment failed');
  const step = () => {
    if (battle.finished || battle.elapsed > 110) throw Error('Lifecycle checkpoint missing');
    model.step(0.05);
  };
  const until = (at: number) => {
    while (battle.elapsed < at - 1e-9) step();
  };
  until(delay);
  model.activeTroop = kind;
  if (!model.deploy(6.9, 20)) throw Error('Delayed lifecycle deployment failed');
  const unit = battle.units.at(-1)!,
    deployed = battle.elapsed;
  const children = () => battle.units.filter((u) => u.native?.owner === unit.id);
  return { model, battle, unit, deployed, data, step, until, children };
}

/** Actual delayed deployment inputs, including the Druid's first Bear frame. */
export function deploymentLifecycleRecording(
  kind: LifecycleKind,
  version = REPLAY_VERSION,
  level = 1,
  research: Partial<Record<TroopKind, number>> = {},
) {
  const r = deploymentLifecycleBattle(kind, level, version, 10, research),
    snapshots: { at: number; battle: Battle }[] = [];
  const snapshot = () => {
    snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  r.step();
  const entered = snapshot();
  r.until(r.deployed + 1.25);
  const beforeFirst = snapshot();
  r.until(r.deployed + 3);
  const children = snapshot();
  r.until(29.95);
  const beforeOld = snapshot();
  r.until(30.05);
  const oldDeadline = snapshot();
  r.until(r.deployed + 29.95);
  const beforeEvolution = snapshot();
  r.until(r.deployed + 30.05);
  const evolved = snapshot();
  r.step();
  r.model.finishBattle();
  return {
    kind,
    id: r.unit.id,
    deployed: r.deployed,
    entered,
    beforeFirst,
    children,
    beforeOld,
    oldDeadline,
    beforeEvolution,
    evolved,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
