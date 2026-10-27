import { GameModel, makeBuilding } from '../../src/game/model';
import { emptyArmy, emptySpells } from '../../src/game/army';
import { activeAsDefense } from '../../src/game/native-defenses';
import { replayBattle, type ReplayData } from '../../src/game/replay';

/** A real Earthquake input wakes the Town Hall before a second Super Giant chooses its target. */
export function nativeActivatedPreferenceRecording() {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 14, 10, 12),
    makeBuilding(2, 'goldstorage', 7, 10, 15),
  ];
  model.state.army = { ...emptyArmy(), supergiant: 3 };
  model.state.spells = { ...emptySpells(), earthquake: 1 };
  model.state.troopLevels = { ...model.state.troopLevels, supergiant: 1 };
  model.state.spellLevels = { ...model.state.spellLevels, earthquake: 1 };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [];
  const battle = (model.battle = replayBattle(data.initial)),
    hall = battle.buildings[0];
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  const step = () => {
    if (battle.finished || battle.elapsed > 10)
      throw Error('Town Hall activation checkpoint missing');
    model.step(0.05);
  };
  model.activeTroop = 'supergiant';
  if (!model.deploy(4, 11.5)) throw Error('First Super Giant deployment failed');
  const firstId = battle.units.at(-1)!.id;
  step();
  if (battle.units.find((u) => u.id === firstId)?.target !== 2 || activeAsDefense(battle, hall))
    throw Error('Dormant Town Hall counted as a defense');
  const dormant = battle.elapsed;
  snapshot();
  step();
  model.activeSpell = 'earthquake';
  if (!model.castSpell(15.5, 11.5)) throw Error('Earthquake input failed');
  while (!activeAsDefense(battle, hall)) step();
  const awake = battle.elapsed;
  snapshot();
  step();
  if (!model.deploy(4, 12.5)) throw Error('Second Super Giant deployment failed');
  const secondId = battle.units.at(-1)!.id;
  step();
  if (battle.units.find((u) => u.id === secondId)?.target !== hall.id)
    throw Error('Super Giant ignored activated Town Hall');
  if (battle.units.find((u) => u.id === firstId)?.target !== 2)
    throw Error('Committed storage target was not retained');
  const targeted = battle.elapsed;
  snapshot();
  step();
  model.finishBattle();
  return {
    dormant,
    awake,
    targeted,
    firstId,
    secondId,
    hallId: hall.id,
    storageId: 2,
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
