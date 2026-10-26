import { GameModel, makeBuilding } from '../../src/game/model';
import { emptyArmy, emptySpells } from '../../src/game/army';
import { replayBattle, type ReplayData } from '../../src/game/replay';

/** A Cannon wounds another ally while Unicorn remains with its healthy assigned Hero. */
export function nativeUnicornRecording(kind: 'king' | 'warden' = 'king', level = 1) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'cannon', 10, 5, 21),
  ];
  model.state.army = { ...emptyArmy(), giant: 2 };
  model.state.spells = emptySpells();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [{ kind, level: 1, items: [], pet: { kind: 'unicorn', level } }];
  const battle = (model.battle = replayBattle(data.initial));
  model.activeTroop = 'giant';
  if (!model.deploy(5, 6.5)) throw Error('Unicorn other-ally deployment failed');
  const giant = battle.units.at(-1)!;
  if (!model.deployNativeHero(kind, 6, 13.5)) throw Error('Unicorn Hero deployment failed');
  const owner = battle.nativeHeroes![0];
  const hero = battle.units.find((u) => u.id === owner.unitId)!;
  const pet = battle.units.find((u) => u.id === owner.petId)!;
  const step = () => {
    if (battle.finished || battle.elapsed > 10)
      throw Error(`Unicorn checkpoint not reached at ${battle.elapsed}`);
    model.step(0.05);
  };
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  step();
  snapshot();
  const initial = battle.elapsed;
  while (giant.hp >= giant.maxHp) step();
  if (giant.hp <= 0 || hero.hp !== hero.maxHp || pet.healTarget !== hero.id)
    throw Error('Unicorn did not retain its healthy master beside the wounded ally');
  snapshot();
  const wounded = battle.elapsed;
  step();
  step();
  snapshot();
  const following = battle.elapsed;
  step();
  model.finishBattle();
  return {
    kind,
    level,
    initial,
    wounded,
    following,
    heroId: hero.id,
    petId: pet.id,
    giantId: giant.id,
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
