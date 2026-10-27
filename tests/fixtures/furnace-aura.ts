import { emptyArmy, emptySpells } from '../../src/game/army';
import { campaignStage } from '../../src/game/campaign-catalog';
import { campaignResources } from '../../src/game/campaign-loot';
import { BUILDINGS } from '../../src/game/data';
import { GameModel, makeBuilding, type Battle } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

export function furnaceAuraBattle(
  level = 1,
  gemLevel = 1,
  version = REPLAY_VERSION,
  apprenticeLevel = 0,
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
  model.state.army = {
    ...emptyArmy(),
    furnace: 1,
    archer: 1,
    apprenticewarden: apprenticeLevel ? 1 : 0,
  };
  model.state.troopLevels = {
    ...model.state.troopLevels,
    furnace: level,
    apprenticewarden: apprenticeLevel || 1,
  };
  model.state.spells = emptySpells();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = gemLevel
    ? [{ kind: 'warden', level: 1, items: [{ slug: 'life-gem', level: gemLevel }] }]
    : [];
  data.initial.catalog = 'goblin-v1';
  data.initial.practice = false;
  data.initial.availableLoot = campaignResources(campaignStage(0, 'goblin-v1'));
  data.initial.lootRoom = { ...data.initial.availableLoot };
  const battle = (model.battle = replayBattle(data.initial, version));
  model.activeHero = false;
  model.activeHeroKind = null;
  model.activeTroop = 'furnace';
  if (!model.deploy(6.9, 20)) throw Error('Aura Furnace deployment failed');
  const unit = battle.units[0];
  if (gemLevel && !model.deployNativeHero('warden', 6.9, 21.5))
    throw Error('Life Gem deployment failed');
  if (apprenticeLevel) {
    model.activeHero = false;
    model.activeHeroKind = null;
    model.activeTroop = 'apprenticewarden';
    if (!model.deploy(6.9, 21.5)) throw Error('Apprentice deployment failed');
  }
  const step = () => {
    if (battle.finished || battle.elapsed > 115) throw Error('Furnace aura checkpoint missing');
    model.step(0.05);
  };
  const until = (at: number) => {
    while (battle.elapsed < at - 1e-9) step();
  };
  return { model, battle, unit, data, step, until };
}

export function furnaceAuraRecording(version = REPLAY_VERSION, gemLevel = 1) {
  const r = furnaceAuraBattle(1, gemLevel, version),
    snapshots: { at: number; battle: Battle }[] = [];
  const snapshot = () => {
    snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  r.until(1);
  const granted = snapshot();
  r.until(20);
  const draining = snapshot();
  r.until(59.95);
  const beforeOld = snapshot();
  r.until(60.1);
  const extended = snapshot();
  r.until(65);
  const later = snapshot();
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    granted,
    draining,
    beforeOld,
    extended,
    later,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
