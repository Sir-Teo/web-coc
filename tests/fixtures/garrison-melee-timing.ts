import { emptyArmy, emptySpells } from '../../src/game/army';
import { campaignStage } from '../../src/game/campaign-catalog';
import { campaignResources } from '../../src/game/campaign-loot';
import type { GarrisonDefender } from '../../src/game/defenders';
import { maxTroopLevel } from '../../src/game/data';
import { GameModel, makeBuilding, type Battle } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

export type MeleeGarrisonKind = 'pekka' | 'valkyrie';
export function garrisonMeleeTimingRecording(
  kind: MeleeGarrisonKind,
  version = REPLAY_VERSION,
  withFreeze = false,
) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 100;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'clancastle', 13, 10, 9),
  ];
  model.state.army = { ...emptyArmy(), giant: 3 };
  model.state.troopLevels = { ...model.state.troopLevels, giant: maxTroopLevel('giant') };
  model.state.spells = { ...emptySpells(), freeze: withFreeze ? 1 : 0 };
  model.state.spellLevels = { ...model.state.spellLevels, freeze: 1 };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [];
  data.initial.catalog = 'goblin-v1';
  data.initial.practice = false;
  data.initial.availableLoot = campaignResources(campaignStage(0, 'goblin-v1'));
  data.initial.lootRoom = { ...data.initial.availableLoot };
  data.initial.garrisons = [
    { castleId: 2, mode: 'guard', troops: [{ kind, level: kind === 'pekka' ? 8 : 7, count: 1 }] },
  ];
  const battle = (model.battle = replayBattle(data.initial, version)),
    snapshots: { at: number; battle: Battle }[] = [];
  model.activeHero = false;
  model.activeHeroKind = null;
  model.activeTroop = 'giant';
  if (!model.deploy(6.9, 11.5) || !model.deploy(6.9, 12.5))
    throw Error('Melee timing deployment failed');
  const step = () => {
    if (battle.finished || battle.elapsed > 25) throw Error('Melee timing checkpoint missing');
    model.step(0.05);
  };
  const snapshot = () => {
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
    return battle.elapsed;
  };
  while (!battle.defenders?.some((d) => d.kind === kind)) step();
  const defender = battle.defenders!.find((d) => d.kind === kind)! as GarrisonDefender,
    spawned = snapshot();
  while (!defender.engaged) step();
  const engaged = snapshot();
  while (!defender.attacks.length) step();
  const first = snapshot();
  let frozen: number | undefined, thawed: number | undefined;
  if (withFreeze) {
    step();
    model.activeSpell = 'freeze';
    if (!model.castSpell(defender.x, defender.y)) throw Error('Melee Freeze failed');
    model.activeSpell = null;
    while (!(defender.frozenUntil && defender.frozenUntil > battle.elapsed)) step();
    frozen = snapshot();
    while (battle.elapsed < defender.frozenUntil! + 0.05 - 1e-9) step();
    thawed = snapshot();
  }
  while ((defender.attackCount ?? 0) < 2) step();
  const second = snapshot();
  for (let i = 0; i < 5; i++) step();
  const later = snapshot();
  step();
  model.finishBattle();
  return {
    kind,
    id: defender.id,
    spawned,
    engaged,
    first,
    frozen,
    thawed,
    second,
    later,
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
