import { emptyArmy, emptySpells } from '../../src/game/army';
import { campaignStage } from '../../src/game/campaign-catalog';
import { campaignResources } from '../../src/game/campaign-loot';
import type { GarrisonDefender } from '../../src/game/defenders';
import { maxTroopLevel } from '../../src/game/data';
import { GameModel, makeBuilding, type Battle } from '../../src/game/model';
import { replayBattle, type ReplayData } from '../../src/game/replay';

/** Actual lure, source melee frost, Wizard kill and defensive death-freeze. */
export function iceGolemGarrisonRecording() {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 100;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'clancastle', 13, 10, 9),
  ];
  model.state.army = { ...emptyArmy(), giant: 3, wizard: 6 };
  model.state.troopLevels = {
    ...model.state.troopLevels,
    giant: maxTroopLevel('giant'),
    wizard: maxTroopLevel('wizard'),
  };
  model.state.spells = emptySpells();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [];
  data.initial.catalog = 'goblin-v1';
  data.initial.practice = false;
  data.initial.availableLoot = campaignResources(campaignStage(0, 'goblin-v1'));
  data.initial.lootRoom = { ...data.initial.availableLoot };
  data.initial.garrisons = [
    { castleId: 2, mode: 'guard', troops: [{ kind: 'icegolem', level: 5, count: 1 }] },
  ];
  const battle = (model.battle = replayBattle(data.initial)),
    snapshots: { at: number; battle: Battle }[] = [];
  model.activeHero = false;
  model.activeHeroKind = null;
  model.activeTroop = 'giant';
  if (!model.deploy(6.9, 11.5) || !model.deploy(6.9, 12.5)) throw Error('Ice Golem lure failed');
  const step = () => {
    if (battle.finished || battle.elapsed > 30) throw Error('Ice Golem checkpoint missing');
    model.step(0.05);
  };
  const snapshot = () => {
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
    return battle.elapsed;
  };
  while (!battle.defenders?.some((d) => d.kind === 'icegolem')) step();
  const defender = battle.defenders!.find((d) => d.kind === 'icegolem')! as GarrisonDefender;
  const spawned = snapshot();
  while (defender.attacks.length < 1) step();
  const melee = snapshot();
  step();
  model.activeTroop = 'wizard';
  for (let i = 0; i < 6; i++)
    if (!model.deploy(8.5, 10 + i * 0.25)) throw Error('Ice Golem Wizard deployment failed');
  while (!defender.deathSpellCast) step();
  const death = snapshot();
  while (!battle.units.some((u) => (u.native?.effects?.frozenUntil ?? 0) > battle.elapsed)) step();
  const frozen = snapshot();
  const until = Math.max(...battle.units.map((u) => u.native?.effects?.frozenUntil ?? 0));
  while (battle.elapsed < until + 0.1) step();
  const thawed = snapshot();
  step();
  model.finishBattle();
  return {
    id: defender.id,
    spawned,
    melee,
    death,
    frozen,
    thawed,
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
