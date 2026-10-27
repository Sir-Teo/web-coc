import { emptyArmy, emptySpells } from '../../src/game/army';
import { campaignStage } from '../../src/game/campaign-catalog';
import { campaignResources } from '../../src/game/campaign-loot';
import { GameModel, makeBuilding, type Battle } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

/** Actual Castle release and attacking Bowler inputs; no injected combat/status state. */
export function bowlerBouldersRecording(version = REPLAY_VERSION) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 100;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'clancastle', 13, 10, 9),
  ];
  model.state.army = { ...emptyArmy(), bowler: 1, giant: 1 };
  model.state.troopLevels = { ...model.state.troopLevels, bowler: 10 };
  model.state.spells = emptySpells();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [];
  data.initial.catalog = 'goblin-v1';
  data.initial.practice = false;
  data.initial.availableLoot = campaignResources(campaignStage(0, 'goblin-v1'));
  data.initial.lootRoom = { ...data.initial.availableLoot };
  data.initial.garrisons = [
    { castleId: 2, mode: 'guard', troops: [{ kind: 'golem', level: 8, count: 1 }] },
  ];
  const battle = (model.battle = replayBattle(data.initial, version)),
    snapshots: { at: number; battle: Battle }[] = [];
  model.activeHero = false;
  model.activeHeroKind = null;
  model.activeTroop = 'bowler';
  if (!model.deploy(11.4, 11.5)) throw Error('Boulder deployment failed');
  const unit = battle.units[0];
  const step = () => {
    if (battle.finished || battle.elapsed > 20) throw Error('Boulder checkpoint missing');
    model.step(0.05);
  };
  const until = (at: number) => {
    while (battle.elapsed < at - 1e-9) step();
  };
  const snapshot = () => {
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
    return battle.elapsed;
  };
  let shot = battle.projectiles?.find((p) => p.sourceId === unit.id && p.targetDefender);
  while (!shot) {
    step();
    shot = battle.projectiles?.find((p) => p.sourceId === unit.id && p.targetDefender);
  }
  const released = snapshot(),
    shotId = shot.id;
  until(shot.launched + (shot.impact - shot.launched) / 2);
  const flying = snapshot();
  while (battle.projectiles!.some((p) => p.id === shotId)) step();
  const hit = snapshot(),
    bounceShot = battle.projectiles!.find(
      (p) =>
        p.sourceId === unit.id &&
        p.native?.bounce === 1 &&
        Math.abs(p.launched - shot!.impact) < 1e-8,
    );
  let bounce: number | undefined, bounceId: string | undefined;
  if (bounceShot) {
    bounceId = bounceShot.id;
    until(bounceShot.launched + (bounceShot.impact - bounceShot.launched) / 2);
    bounce = snapshot();
  }
  until(shot.impact + 1.2);
  const settled = snapshot();
  step();
  model.finishBattle();
  return {
    id: unit.id,
    shotId,
    bounceId,
    released,
    flying,
    hit,
    bounce,
    settled,
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
