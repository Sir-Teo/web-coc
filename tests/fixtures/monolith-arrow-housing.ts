import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { replayBattle, type ReplayData } from '../../src/game/replay';

export function monolithHousingBattle(level = 1) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'goldstorage', 12, 10, 15),
  ];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), giant: 44, archer: 5, wallwrecker: 1 };
  model.state.spells = { ...emptySpells(), recall: 1, rage: 1 };
  model.state.spellLevels = defaultSpellLevels();
  model.state.king = undefined;
  model.startBattle(0, true);
  const recording = (model as unknown as { recording: ReplayData }).recording;
  recording.initial.heroes = [
    { kind: 'queen', level: 1, items: [{ slug: 'monolith-arrow', level }] },
    {
      kind: 'king',
      level: 1,
      items: [{ slug: 'barbarian-puppet', level: 1 }],
      pet: { kind: 'lassi', level: 1 },
    },
  ];
  model.battle = replayBattle(recording.initial);
  return { model, battle: model.battle };
}

/** Actual deployments at both tier boundaries, followed by Recall and redeployment. */
export function monolithHousingRecording(level = 1) {
  const { model, battle } = monolithHousingBattle(level);
  const until = (at: number) => {
    for (let remaining = 200; battle.elapsed < at - 1e-9; remaining--) {
      if (!remaining || battle.finished) throw Error('Monolith housing checkpoint was not reached');
      model.step(0.05);
    }
  };
  const deploy = (kind: 'giant' | 'archer' | 'wallwrecker', count: number) => {
    model.activeTroop = kind;
    if (model.deployMany(35, 5, count) !== count) throw Error(`Failed to deploy ${kind}`);
  };
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  deploy('giant', 31);
  if (!model.deployNativeHero('queen', 6.9, 11.5)) throw Error('Monolith Queen deployment failed');
  const queenId = battle.nativeHeroes![0].unitId!;
  until(0.15);
  snapshot();
  const at180 = battle.elapsed;
  until(at180 + 0.05);
  deploy('archer', 1);
  until(0.9);
  snapshot();
  const at181 = battle.elapsed;
  until(at181 + 0.05);
  deploy('giant', 13);
  deploy('archer', 4);
  until(1.65);
  snapshot();
  const at250 = battle.elapsed;
  until(at250 + 0.05);
  deploy('wallwrecker', 1);
  until(2.4);
  snapshot();
  const at251 = battle.elapsed;
  until(at251 + 0.05);
  model.activeSpell = 'recall';
  if (!model.castSpell(32, 6)) throw Error('Monolith housing Recall failed');
  until(3.5);
  snapshot();
  const recalled = battle.elapsed;
  if (!battle.recalledHp?.giant?.length) throw Error('No Giants were recalled');
  until(recalled + 0.05);
  deploy('giant', 3);
  until(3.6);
  snapshot();
  const redeployed = battle.elapsed;
  until(4);
  model.finishBattle();
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
    snapshots,
    at180,
    at181,
    at250,
    at251,
    recalled,
    redeployed,
    queenId,
  };
}
