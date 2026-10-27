import { emptyArmy, emptySpells } from '../../src/game/army';
import { campaignStage } from '../../src/game/campaign-catalog';
import { campaignResources } from '../../src/game/campaign-loot';
import { GameModel, makeBuilding, type Battle } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';
import type { CombatProjectile } from '../../src/game/projectiles';

/** Actual Castle Archer release and a complete wall barrier; no injected HP/status state. */
export function bowlerPursuitWallRecording(version = REPLAY_VERSION) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 100;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'clancastle', 17, 10, 9),
    ...Array.from({ length: 48 }, (_, y) => makeBuilding(1000 + y, 'wall', 12, y, 15)),
  ];
  model.state.army = { ...emptyArmy(), bowler: 1, archer: 1 };
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
    { castleId: 2, mode: 'guard', troops: [{ kind: 'archer', level: 9, count: 1 }] },
  ];
  const battle = (model.battle = replayBattle(data.initial, version)),
    snapshots: { at: number; battle: Battle }[] = [],
    shots: CombatProjectile[] = [],
    seen = new Set<string>();
  model.activeHero = false;
  model.activeHeroKind = null;
  model.activeTroop = 'bowler';
  if (!model.deploy(10.9, 11.5)) throw Error('Pursuit-wall deployment failed');
  const unit = battle.units[0];
  const isWall = (p: CombatProjectile) =>
    p.sourceId === unit.id &&
    p.targetBuilding &&
    battle.buildings.find((b) => b.id === p.targetId)?.kind === 'wall';
  const step = () => {
    if (battle.finished || battle.elapsed > 18) throw Error('Pursuit-wall checkpoint missing');
    model.step(0.05);
    for (const p of battle.projectiles ?? [])
      if (isWall(p) && !seen.has(p.id)) {
        seen.add(p.id);
        shots.push(structuredClone(p));
      }
  };
  const until = (at: number) => {
    while (battle.elapsed < at - 1e-9) step();
  };
  const snapshot = () => {
    if (snapshots.at(-1)?.at !== battle.elapsed)
      snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
    return battle.elapsed;
  };
  while (!shots.length) step();
  const firstWall = snapshot();
  while (unit.defenderTarget === undefined) step();
  const pursuing = snapshot(),
    defenderId = unit.defenderTarget;
  let shot = shots.find((p) => p.launched >= pursuing - 1e-9);
  while (!shot) {
    step();
    shot = shots.find((p) => p.launched >= pursuing - 1e-9);
  }
  const released = snapshot(),
    shotId = shot.id;
  until(shot.launched + (shot.impact - shot.launched) / 2);
  const flying = snapshot();
  until(shot.impact + 0.05);
  const landed = snapshot();
  until(released + 2.5);
  const later = snapshot();
  step();
  model.finishBattle();
  return {
    id: unit.id,
    defenderId,
    firstWall,
    pursuing,
    released,
    shotId,
    flying,
    landed,
    later,
    shots,
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
