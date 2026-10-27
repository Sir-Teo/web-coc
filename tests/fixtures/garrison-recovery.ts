import { emptyArmy, emptySpells } from '../../src/game/army';
import { campaignStage } from '../../src/game/campaign-catalog';
import { campaignResources } from '../../src/game/campaign-loot';
import type { GarrisonDefender } from '../../src/game/defenders';
import { GameModel, makeBuilding, type Battle } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

export type RecoveryGarrisonKind = 'electrodragon' | 'golem' | 'bowler' | 'lavahound';
/** A source-level Archer falls to actual fire; the defender retargets a durable Golem. */
export function garrisonRecoveryRecording(kind: RecoveryGarrisonKind, version = REPLAY_VERSION) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 100;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'clancastle', 13, 10, 9),
  ];
  model.state.army = { ...emptyArmy(), archer: 2, golem: 1 };
  model.state.troopLevels = { ...model.state.troopLevels, archer: 1, golem: 1 };
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
    {
      castleId: 2,
      mode: 'guard',
      troops: [
        {
          kind,
          level: kind === 'electrodragon' ? 3 : kind === 'golem' ? 8 : kind === 'bowler' ? 4 : 6,
          count: 1,
        },
      ],
    },
  ];
  const battle = (model.battle = replayBattle(data.initial, version)),
    snapshots: { at: number; battle: Battle }[] = [];
  model.activeHero = false;
  model.activeHeroKind = null;
  model.activeTroop = 'archer';
  if (!model.deploy(6.9, 11.5)) throw Error('Recovery Archer deployment failed');
  model.activeTroop = 'golem';
  if (!model.deploy(6.9, 12.5)) throw Error('Recovery Golem deployment failed');
  const step = () => {
    if (battle.finished || battle.elapsed > 25) throw Error('Garrison recovery checkpoint missing');
    model.step(0.05);
  };
  const snapshot = () => {
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
    return battle.elapsed;
  };
  while (!battle.defenders?.some((d) => d.kind === kind)) step();
  const defender = battle.defenders!.find((d) => d.kind === kind)! as GarrisonDefender,
    spawned = snapshot();
  while (!defender.attacks.length) step();
  const first = snapshot(),
    firstTarget = defender.attacks[0].targetId;
  while (battle.units.find((u) => u.id === firstTarget)!.hp > 0) step();
  const fallen = snapshot();
  while (defender.target === firstTarget || defender.target === null) step();
  const switched = snapshot(),
    nextTarget = defender.target;
  while (!defender.attacks.some((a) => a.targetId === nextTarget)) step();
  const returned = snapshot();
  for (let i = 0; i < 8; i++) step();
  const later = snapshot();
  step();
  model.finishBattle();
  return {
    kind,
    id: defender.id,
    spawned,
    first,
    fallen,
    switched,
    returned,
    later,
    firstTarget,
    nextTarget,
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
