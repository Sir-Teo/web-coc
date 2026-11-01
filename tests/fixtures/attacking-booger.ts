import { emptyArmy, emptySpells } from '../../src/game/army';
import { campaignStage } from '../../src/game/campaign-catalog';
import { campaignResources } from '../../src/game/campaign-loot';
import { GameModel, makeBuilding, type Battle } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

/** A deployed King carries Sneezy, which schedules and completes a real Booger summon. */
export function attackingBoogerBattle(
  level = 1,
  version = REPLAY_VERSION,
  x = 11.4,
  controlled = true,
) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 100;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'goldstorage', 13, 10, 18),
  ];
  model.state.army = { ...emptyArmy(), archer: 1 };
  model.state.spells = emptySpells();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [{ kind: 'king', level: 1, items: [], pet: { kind: 'sneezy', level } }];
  data.initial.catalog = 'goblin-v1';
  data.initial.practice = false;
  data.initial.availableLoot = campaignResources(campaignStage(0, 'goblin-v1'));
  data.initial.lootRoom = { ...data.initial.availableLoot };
  const battle = (model.battle = replayBattle(data.initial, version));
  if (!model.deployNativeHero('king', x, 11.5)) throw Error('Sneezy Hero deployment failed');
  const pet = battle.units.find((u) => u.kind === 'sneezy')!;
  const step = () => {
    if (battle.finished || battle.elapsed > 25) throw Error('Booger checkpoint expired');
    model.step(0.05);
  };
  while (!battle.units.some((u) => u.kind === 'booger')) step();
  const unit = battle.units.find((u) => u.kind === 'booger')!;
  if (controlled)
    for (const other of battle.units)
      if (other !== unit) (other.native!.effects ??= {}).frozenUntil = 100;
  const until = (at: number) => {
    while (battle.elapsed < at - 1e-9) step();
  };
  const untilAttacks = (count: number) => {
    while ((unit.native?.attacks ?? 0) < count) step();
  };
  return { model, battle, unit, pet, data, step, until, untilAttacks };
}

/** Ordinary Hero/pet deployment; no injected damage, target or status state. */
export function attackingBoogerRecording(level = 1, version = REPLAY_VERSION, x = 11.4) {
  const r = attackingBoogerBattle(level, version, x, false),
    snapshots: { at: number; battle: Battle }[] = [];
  const snapshot = () => {
    if (snapshots.at(-1)?.at !== r.battle.elapsed)
      snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  const born = snapshot();
  while (!r.unit.attacking) r.step();
  const engaged = snapshot();
  const activeAtEngagement = r.unit.native?.attackWindup?.actionDt ?? 0.05;
  r.untilAttacks(1);
  const first = snapshot();
  r.until(first + 0.2);
  const recovery = snapshot();
  r.untilAttacks(2);
  const second = snapshot();
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    petId: r.pet.id,
    level: r.unit.level!,
    born,
    engaged,
    first,
    recovery,
    second,
    activeAtEngagement,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
