import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { replayBattle, type ReplayData } from '../../src/game/replay';

/** Real Cannon hits knock out a deployed Hero; Phoenix revives it, optionally across Recall. */
export function nativePhoenixRecording(level = 1, recall = false) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'cannon', 10, 5, 21),
  ];
  model.state.nextId = 1000;
  model.state.king = undefined;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), recall: recall ? 1 : 0 };
  model.state.spellLevels = defaultSpellLevels();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [{ kind: 'king', level: 1, items: [], pet: { kind: 'phoenix', level } }];
  model.battle = replayBattle(data.initial);
  const battle = model.battle,
    owner = battle.nativeHeroes![0];
  if (!model.deployNativeHero('king', 5, 6.5)) throw Error('Phoenix Hero deployment failed');
  const initialHeroId = owner.unitId!,
    initialBirdId = owner.petId!,
    eggId = owner.phoenix!.eggId!;
  if (!model.activateNativeHeroAbility('king')) throw Error('Phoenix initial ability input failed');
  const step = () => {
    if (battle.finished || battle.elapsed > 40)
      throw Error(`Phoenix checkpoint not reached at ${battle.elapsed}`);
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
  const waiting = battle.elapsed;
  while (!owner.phoenix!.pending) step();
  const shot = battle.projectiles!.find((p) => p.native?.phoenixRevive)!;
  const hatched = shot.launched;
  until(shot.impact - 0.05);
  snapshot();
  const inFlight = battle.elapsed;
  until(shot.impact + 0.1);
  snapshot();
  const revived = battle.elapsed;
  let unit = battle.units.find((u) => u.id === owner.unitId)!;
  let revivedUntil = unit.native!.effects!.phoenixRevive!.until;
  let recalled: number | undefined, held: number | undefined, redeployed: number | undefined;
  if (recall) {
    step();
    model.activeSpell = 'recall';
    if (!model.castSpell(unit.x, unit.y)) throw Error('Phoenix revived Hero Recall failed');
    while (owner.unitId !== null) step();
    snapshot();
    recalled = battle.elapsed;
    until(battle.elapsed + 3);
    snapshot();
    held = battle.elapsed;
    step();
    if (!model.deployNativeHero('king', 5, 12))
      throw Error('Phoenix recalled Hero redeployment failed');
    step();
    snapshot();
    redeployed = battle.elapsed;
    unit = battle.units.find((u) => u.id === owner.unitId)!;
    revivedUntil = unit.native!.effects!.phoenixRevive!.until;
  }
  until(revivedUntil - 0.05);
  snapshot();
  const lastAlive = battle.elapsed;
  until(revivedUntil + 0.1);
  snapshot();
  const expired = battle.elapsed;
  step();
  model.finishBattle();
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
    snapshots,
    level,
    recall,
    initialHeroId,
    initialBirdId,
    eggId,
    waiting,
    hatched,
    inFlight,
    revived,
    revivedUntil,
    lastAlive,
    expired,
    recalled,
    held,
    redeployed,
    shot: JSON.parse(JSON.stringify(shot)),
  };
}
