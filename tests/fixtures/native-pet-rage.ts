import { GameModel, makeBuilding } from '../../src/game/model';
import { emptyArmy, emptySpells } from '../../src/game/army';
import { replayBattle, type ReplayData } from '../../src/game/replay';
import { unitDamageScale } from '../../src/game/native-status';

/** Actual Cannon damage knocks out a Hero; its living Yak's source boost starts and expires. */
export function nativePetRageRecording(level = 1) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.king = undefined;
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'cannon', 1, 1, 21),
    makeBuilding(3, 'cannon', 1, 4, 21),
  ];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = emptySpells();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [{ kind: 'king', level: 1, items: [], pet: { kind: 'yak', level } }];
  const battle = (model.battle = replayBattle(data.initial));
  if (!model.deployNativeHero('king', 6, 6.5) || !model.activateNativeHeroAbility('king'))
    throw Error('Yak Hero inputs failed');
  const owner = battle.nativeHeroes![0];
  const hero = battle.units.find((u) => u.id === owner.unitId)!;
  const pet = battle.units.find((u) => u.id === owner.petId)!;
  const step = () => {
    if (battle.finished || battle.elapsed > 25)
      throw Error(`Yak checkpoint not reached at ${battle.elapsed}`);
    model.step(0.05);
  };
  const until = (at: number) => {
    while (battle.elapsed < at - 1e-9) step();
  };
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  step();
  snapshot();
  const initial = battle.elapsed;
  while (!owner.petHeroDeathUsed) step();
  const started = battle.elapsed;
  until(started + 0.2);
  snapshot();
  const raged = battle.elapsed;
  until(started + 7.95);
  if (unitDamageScale(pet, battle.elapsed) !== 1.7 || pet.hp <= 0)
    throw Error('Yak did not retain its living eight-second boost');
  snapshot();
  const lastActive = battle.elapsed;
  until(started + 8);
  if (unitDamageScale(pet, battle.elapsed) !== 1 || pet.hp <= 0)
    throw Error('Yak source boost did not expire');
  snapshot();
  const expired = battle.elapsed;
  step();
  model.finishBattle();
  return {
    level,
    initial,
    started,
    raged,
    lastActive,
    expired,
    heroId: hero.id,
    petId: pet.id,
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
