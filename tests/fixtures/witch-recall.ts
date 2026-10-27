import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding, type Unit } from '../../src/game/model';
import { nativeUnitStats } from '../../src/game/native-units';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';
import { campaignResources } from '../../src/game/campaign-loot';
import { campaignStage } from '../../src/game/campaign-catalog';

export type RecallWitchKind = 'witch' | 'superwitch';
export function witchRecallBattle(
  kind: RecallWitchKind = 'superwitch',
  level = 1,
  version = REPLAY_VERSION,
  count = 1,
) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 100;
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
  model.state.army = { ...emptyArmy(), [kind]: count, giant: 1 };
  model.state.troopLevels = { ...model.state.troopLevels, [kind]: level };
  model.state.spells = { ...emptySpells(), recall: 2 };
  model.state.spellLevels = defaultSpellLevels();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [];
  // A campaign Town Hall has no Home Village Guardian to kill the summons under inspection.
  data.initial.catalog = 'goblin-v1';
  data.initial.practice = false;
  data.initial.availableLoot = campaignResources(campaignStage(0, 'goblin-v1'));
  data.initial.lootRoom = { ...data.initial.availableLoot };
  const battle = (model.battle = replayBattle(data.initial, version)),
    stats = nativeUnitStats(kind, level);
  const deploy = (x = 6.9, y = 11.5) => {
    model.activeSpell = null;
    model.activeHero = false;
    model.activeHeroKind = null;
    model.activeTroop = kind;
    if (!model.deploy(x, y)) throw Error('Witch deployment failed');
    return battle.units.at(-1)!;
  };
  const unit = deploy();
  const step = () => {
    if (battle.finished || battle.elapsed > 100) throw Error('Witch Recall checkpoint missing');
    model.step(0.05);
  };
  const until = (at: number) => {
    while (battle.elapsed < at - 1e-9) step();
  };
  const children = () =>
    battle.units.filter((u) => u.kind === (kind === 'witch' ? 'skeleton' : 'bigboy') && u.hp > 0);
  const recall = (unit: Unit) => {
    model.activeSpell = 'recall';
    if (!model.castSpell(unit.x, unit.y)) throw Error('Witch Recall failed');
    while (!unit.native?.recalled) step();
    model.activeSpell = null;
  };
  return { model, battle, data, stats, unit, deploy, step, until, children, recall };
}

/** Recall after the original children have fully materialized; no injected combat state. */
export function witchRecallRecording(
  kind: RecallWitchKind = 'superwitch',
  version = REPLAY_VERSION,
) {
  const r = witchRecallBattle(kind, 1, version),
    snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () => {
    snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  while (!r.children().length) r.step();
  r.until(Math.max(...r.children().map((u) => u.spawnedAt!)) + 0.1);
  const full = snapshot(),
    oldId = r.unit.id,
    childIds = r.children().map((u) => u.id),
    nextAt = r.unit.native!.summonAt!;
  r.step();
  r.recall(r.unit);
  const recalled = snapshot();
  r.until(r.battle.elapsed + 1);
  const held = snapshot();
  r.step();
  const unit = r.deploy(6.9, 20),
    newId = unit.id;
  r.step();
  const returned = snapshot();
  r.until(r.battle.elapsed + r.stats.summonTime + 0.1);
  const settled = snapshot();
  r.until(nextAt + r.stats.summonTime + 0.15);
  const next = snapshot();
  r.step();
  r.model.finishBattle();
  return {
    kind,
    oldId,
    newId,
    childIds,
    nextAt,
    full,
    recalled,
    held,
    returned,
    settled,
    next,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
