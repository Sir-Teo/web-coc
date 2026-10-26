import { emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../../src/game/replay';

/** A real pet deployment, emergence, repeated hits and defense recovery. */
export function diggyStunRecording(level = 1, version = REPLAY_VERSION) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'cannon', 8, 5, 21),
  ];
  model.state.nextId = 1000;
  model.state.king = undefined;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = emptySpells();
  model.startBattle(0, true);
  const recording = (model as unknown as { recording: ReplayData }).recording;
  recording.version = version;
  recording.initial.heroes = [
    {
      kind: 'queen',
      level: 1,
      items: [],
      pet: { kind: 'diggy', level },
    },
  ];
  model.battle = replayBattle(recording.initial, version);
  const battle = model.battle;
  if (!model.deployNativeHero('queen', 5, 6.5)) throw Error('Diggy stun deployment failed');
  const petId = battle.nativeHeroes![0].petId!;
  const pet = battle.units.find((u) => u.id === petId)!;
  const attacks: number[] = [];
  const cannonShots: number[] = [];
  model.onEffect = (fx) => {
    if (fx.sourceId === petId && fx.type === 'hit' && fx.targetBuilding)
      attacks.push(battle.elapsed);
    if (fx.sourceId === 2 && fx.type === 'projectile') cannonShots.push(battle.elapsed);
  };
  const step = () => {
    if (battle.elapsed > 10 || battle.finished || pet.hp <= 0)
      throw Error(`Diggy stun checkpoint was not reached at ${battle.elapsed}s`);
    model.step(0.05);
  };
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  model.step(0.05);
  snapshot();
  const moving = battle.elapsed;
  while (!attacks.length) step();
  snapshot();
  const surfaced = battle.elapsed;
  const until = battle.defenseStuns[2] ?? surfaced + (level === 10 ? 3 : level >= 5 ? 2.5 : 2);
  while (battle.elapsed < surfaced + 1.2 - 1e-9) step();
  snapshot();
  const repeated = battle.elapsed;
  while (battle.elapsed < until + 0.05 - 1e-9) step();
  while (!cannonShots.some((at) => at > until + 1e-9)) step();
  snapshot();
  const recovered = battle.elapsed;
  step();
  model.finishBattle();
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
    snapshots,
    moving,
    surfaced,
    repeated,
    recovered,
    until,
    petId,
    attacks,
    cannonShots,
  };
}
