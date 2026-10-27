import { emptyArmy, emptySpells } from '../../src/game/army';
import { campaignStage } from '../../src/game/campaign-catalog';
import { campaignResources } from '../../src/game/campaign-loot';
import { GameModel, makeBuilding, type Battle } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

export function attackingHoundBattle(
  level = 1,
  version = REPLAY_VERSION,
  x = 11.4,
  ice = false,
  defense = false,
) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 100;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, defense ? 'airdefense' : 'goldstorage', 13, 10, defense ? 1 : 18),
  ];
  model.state.army = {
    ...emptyArmy(),
    lavahound: ice ? 0 : 1,
    icehound: ice ? 1 : 0,
    archer: 1,
  };
  model.state.troopLevels = { ...model.state.troopLevels, lavahound: level, icehound: level };
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
  model.activeTroop = ice ? 'icehound' : 'lavahound';
  if (!model.deploy(x, 11.5)) throw Error('Hound fixture deployment failed');
  const step = () => {
    if (battle.finished || battle.elapsed > 35) throw Error('Hound checkpoint missing');
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
/** Ordinary Hound deployment against an optional armed Air Defense; no injected combat/status state. */
export function attackingHoundRecording(
  version = REPLAY_VERSION,
  x = 11.4,
  level = 1,
  ice = false,
) {
  const r = attackingHoundBattle(level, version, x, ice, true),
    snapshots: { at: number; battle: Battle }[] = [];
  const snapshot = () => {
    if (snapshots.at(-1)?.at !== r.battle.elapsed)
      snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  const born = snapshot();
  while (!r.unit.attacking) r.step();
  const engaged = snapshot();
  let charged: number | undefined;
  if (version >= 169) {
    r.until(engaged + 0.7);
    charged = snapshot();
    r.untilAttacks(1);
  }
  const first = snapshot();
  let flying: number | undefined, hit: number | undefined, shotId: string | undefined;
  if (version >= 169 && !ice) {
    const shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
    shotId = shot.id;
    r.until(shot.launched + (shot.impact - shot.launched) / 2);
    flying = snapshot();
    while (r.battle.projectiles?.some((p) => p.id === shotId)) r.step();
    hit = snapshot();
  }
  r.untilAttacks(2);
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
    flying,
    hit,
    shotId,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
