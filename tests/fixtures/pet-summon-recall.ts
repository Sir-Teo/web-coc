import { GameModel, makeBuilding } from '../../src/game/model';
import { emptyArmy, emptySpells } from '../../src/game/army';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

/** Recall preserves two independently living Boogers when the carried pet gets a new body. */
export function petSummonRecallRecording(level = 1, version = REPLAY_VERSION) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 1)];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), recall: 1 };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [{ kind: 'king', level: 1, items: [], pet: { kind: 'sneezy', level } }];
  const battle = (model.battle = replayBattle(data.initial, version));
  if (!model.deployNativeHero('king', 5, 6.5)) throw Error('Summon Recall Hero deployment failed');
  const owner = battle.nativeHeroes![0],
    oldPetId = owner.petId!,
    hero = battle.units.find((u) => u.id === owner.unitId)!;
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  const step = () => {
    if (battle.finished || battle.elapsed > 22) throw Error('Summon Recall checkpoint not reached');
    model.step(0.05);
  };
  const until = (at: number) => {
    while (battle.elapsed < at - 1e-9) step();
  };
  until(14.1);
  const children = battle.units.filter((u) => u.kind === 'booger' && u.hp > 0);
  if (children.length !== 2) throw Error('Initial Sneezy Booger cap missing');
  const full = battle.elapsed;
  snapshot();
  step();
  model.activeSpell = 'recall';
  if (!model.castSpell(hero.x, hero.y)) throw Error('Summon Recall cast failed');
  while (owner.unitId !== null) step();
  const recalled = battle.elapsed;
  snapshot();
  step();
  if (!model.deployNativeHero('king', 5, 6.5)) throw Error('Summon Recall redeployment failed');
  const deployed = battle.elapsed,
    petId = owner.petId!;
  if (petId === oldPetId) throw Error('Recall did not create its new pet body');
  until(deployed + 1.1);
  const alive = battle.units.filter((u) => u.kind === 'booger' && u.hp > 0),
    pending = battle.nativePendingSpawns?.filter((p) => p.kind === 'booger') ?? [];
  if (alive.length !== 2 || pending.length || owner.petSummonerId !== oldPetId)
    throw Error('Recall created an extra Booger');
  const blocked = battle.elapsed;
  snapshot();
  step();
  model.finishBattle();
  return {
    level,
    full,
    recalled,
    blocked,
    oldPetId,
    petId,
    childIds: children.map((u) => u.id),
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
