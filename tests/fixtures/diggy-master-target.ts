import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../../src/game/replay';

export type DiggyMasterMode = 'wall' | 'defense' | 'defender-wall';
export function diggyMasterBattle(mode: DiggyMasterMode = 'defense', version = REPLAY_VERSION) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 5, 18),
    ...(mode !== 'defense'
      ? Array.from({ length: 48 }, (_, y) => makeBuilding(100 + y, 'wall', 8, y, 18))
      : [makeBuilding(2, 'cannon', 14, 5, 21), makeBuilding(3, 'goldstorage', 8, 5, 15)]),
  ];
  model.state.nextId = 1000;
  model.state.king = undefined;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), ...(mode === 'defender-wall' ? { freeze: 1 } : {}) };
  model.state.spellLevels = defaultSpellLevels();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  const kind = mode !== 'defense' ? 'king' : 'champion';
  data.initial.heroes = [{ kind, level: 1, items: [], pet: { kind: 'diggy', level: 1 } }];
  if (mode === 'defender-wall')
    data.initial.defendingHeroes = [{ kind: 'king', level: 110, x: 12, y: 6.5 }];
  model.battle = replayBattle(data.initial, version);
  if (!model.deployNativeHero(kind, 5, 6.5)) throw Error('Diggy master deployment failed');
  if (mode === 'defender-wall') {
    model.activeSpell = 'freeze';
    if (!model.castSpell(12, 6.5)) throw Error('Diggy master enemy Freeze failed');
  }
  const battle = model.battle;
  const hero = battle.nativeHeroes![0];
  const master = battle.units.find((u) => u.id === hero.unitId)!;
  const pet = battle.units.find((u) => u.id === hero.petId)!;
  return { model, battle, hero, master, pet };
}

/** Real inputs separate a Hero's chosen target from Diggy's nearest independent target. */
export function diggyMasterRecording(mode: DiggyMasterMode) {
  const { model, battle, master, pet } = diggyMasterBattle(mode);
  const hits: { at: number; target: number }[] = [];
  model.onEffect = (fx) => {
    if (fx.sourceId === pet.id && fx.type === 'hit' && fx.targetBuilding)
      hits.push({ at: battle.elapsed, target: fx.targetId! });
  };
  const step = () => {
    if (battle.elapsed > 8 || battle.finished || pet.hp <= 0)
      throw Error(`Diggy master checkpoint was not reached at ${battle.elapsed}s`);
    model.step(0.05);
  };
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  step();
  snapshot();
  const moving = battle.elapsed;
  while (!hits.length) step();
  snapshot();
  const hit = battle.elapsed;
  const targetId = hits[0].target;
  if ((master.native?.wallTarget ?? master.target) !== targetId)
    throw Error('Diggy did not hit its Hero target');
  while (battle.elapsed < hit + 0.8 - 1e-9) step();
  snapshot();
  const following = battle.elapsed;
  step();
  model.finishBattle();
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
    snapshots,
    moving,
    hit,
    following,
    targetId,
    petId: pet.id,
    masterId: master.id,
    hits,
  };
}
