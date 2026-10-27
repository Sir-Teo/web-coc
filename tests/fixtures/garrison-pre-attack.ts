import { emptyArmy, emptySpells } from '../../src/game/army';
import { campaignStage } from '../../src/game/campaign-catalog';
import { campaignResources } from '../../src/game/campaign-loot';
import { maxTroopLevel } from '../../src/game/data';
import type { GarrisonDefender } from '../../src/game/defenders';
import { GameModel, makeBuilding, type Battle } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

export function garrisonPreAttackRecording(version = REPLAY_VERSION, withFreeze = false) {
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
    { castleId: 2, mode: 'guard', troops: [{ kind: 'electrodragon', level: 3, count: 1 }] },
  ];
  const battle = (model.battle = replayBattle(data.initial, version)),
    snapshots: { at: number; battle: Battle }[] = [];
  model.activeHero = false;
  model.activeHeroKind = null;
  model.activeTroop = 'giant';
  if (!model.deploy(6.9, 11.5) || !model.deploy(6.9, 12.5)) throw Error('Charge deployment failed');
  const step = () => {
    if (battle.finished || battle.elapsed > 30) throw Error('Garrison charge checkpoint missing');
    model.step(0.05);
  };
  const until = (at: number) => {
    while (battle.elapsed < at - 1e-9) step();
  };
  const snapshot = () => {
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
    return battle.elapsed;
  };
  while (!battle.defenders?.some((d) => d.kind === 'electrodragon')) step();
  const defender = battle.defenders!.find((d) => d.kind === 'electrodragon')! as GarrisonDefender,
    spawned = snapshot();
  while (!defender.engaged) step();
  const charging = snapshot();
  until(battle.elapsed + 0.3);
  const charged = snapshot();
  let beforeFreeze: number | undefined,
    frozen: number | undefined,
    held: number | undefined,
    resumed: number | undefined;
  if (withFreeze) {
    step();
    model.activeSpell = 'freeze';
    if (!model.castSpell(defender.x, defender.y)) throw Error('Charge Freeze failed');
    model.activeSpell = null;
    const impact = battle.nativeSpells!.find((c) => c.name === 'Freeze')!.firstHit;
    until(impact - 0.05);
    beforeFreeze = snapshot();
    until(impact + 0.05);
    frozen = snapshot();
    until(impact + 0.3);
    held = snapshot();
    until(defender.frozenUntil! + 0.05);
    resumed = snapshot();
  }
  while (!defender.attacks.length) step();
  const first = snapshot();
  // The same-target recovery lasts 625 ms; the next charge then begins.
  until(battle.elapsed + 0.7);
  const nextCharge = snapshot();
  while ((defender.attackCount ?? 0) < 2) step();
  const second = snapshot();
  step();
  model.finishBattle();
  return {
    id: defender.id,
    spawned,
    charging,
    charged,
    beforeFreeze,
    frozen,
    held,
    resumed,
    first,
    nextCharge,
    second,
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
