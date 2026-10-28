import { GameModel, makeBuilding } from '../../src/game/model';
import { emptyArmy, emptySpells } from '../../src/game/army';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';
/** Real Cannon knockout and Freeze inputs prepare a living game's direct Revive controls. */
export function prepareReviveTargeting(
  model = new GameModel(),
  reviveLevel = 1,
  reviveCount = 2,
  version = REPLAY_VERSION,
) {
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 1),
    makeBuilding(2, 'cannon', 10, 10, 21),
  ];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), revive: reviveCount, freeze: 1 };
  model.state.spellLevels = { ...model.state.spellLevels, revive: reviveLevel, freeze: 8 };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [{ kind: 'queen', level: 1, items: [] }];
  const battle = (model.battle = replayBattle(data.initial, version)),
    step = () => {
      if (battle.finished || battle.elapsed > 50)
        throw Error('Revive targeting checkpoint missing');
      model.step(0.05);
    };
  if (!model.deployNativeHero('queen', 5, 10)) throw Error('Queen deploy failed');
  const queen = battle.units.find((u) => u.hero === 'queen')!;
  while (queen.hp > 0) step();
  model.activeSpell = 'freeze';
  if (!model.castSpell(11.5, 11.5)) throw Error('Cannon Freeze failed');
  const hit = battle.nativeSpells!.find((c) => c.name === 'Freeze')!.firstHit;
  while (battle.elapsed < hit + 0.1 - 1e-9) step();
  model.activeSpell = null;
  model.activeHeroKind = null;
  model.activeHero = false;
  model.activeTroop = 'giant';
  model.changed();
  return { model, battle, data, queenId: queen.id, knocked: battle.elapsed };
}
export function reviveTargetingRecording() {
  const r = prepareReviveTargeting(),
    { model, battle } = r,
    snapshots: { at: number; battle: unknown }[] = [];
  const sample = (at: number) => {
    while (battle.elapsed < at - 1e-9) model.step(0.05);
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
    return battle.elapsed;
  };
  const knocked = sample(battle.elapsed);
  model.step(0.05);
  if (!model.castReviveOnHero('queen')) throw Error('Direct Queen Revive failed');
  const first = battle.nativeSpells!.find((c) => c.name === 'Revive')!.firstHit,
    waiting = sample(first - 0.05),
    revived = sample(first + 0.05);
  model.step(0.05);
  model.finishBattle();
  return {
    queenId: r.queenId,
    knocked,
    waiting,
    revived,
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
