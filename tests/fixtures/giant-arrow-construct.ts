import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

export function giantConstructArena(diagonal = true, version = REPLAY_VERSION) {
  const model = new GameModel();
  const tower = makeBuilding(4, 'spelltower', diagonal ? 10 : 17, diagonal ? 5 : 6, 3);
  tower.spellMode = 'invisibility';
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'goldmine', diagonal ? 5 : 14, diagonal ? 5 : 10, 16),
    tower,
    makeBuilding(5, 'goldstorage', diagonal ? 8 : 26, diagonal ? 8 : 10, 16),
  ];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), recall: 1, freeze: 1, overgrowth: 1 };
  model.state.spellLevels = defaultSpellLevels();
  model.state.king = undefined;
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [
    { kind: 'queen', level: 1, items: [{ slug: 'piercing-arrow', level: 1 }] },
  ];
  const battle = (model.battle = replayBattle(data.initial, version));
  if (!model.deployNativeHero('queen', diagonal ? 2.1 : 6.9, diagonal ? 2.1 : 11.5))
    throw Error('Giant construct Queen deployment failed');
  const queenId = battle.nativeHeroes![0].unitId!;
  const until = (at: number) => {
    for (let remaining = 2000; battle.elapsed < at - 1e-9; remaining--) {
      if (!remaining || battle.finished) throw Error('Giant construct checkpoint was not reached');
      model.step(0.05);
    }
  };
  const launch = () => {
    until(0.05);
    model.activeSpell = 'recall';
    const unit = battle.units.find((u) => u.id === queenId)!;
    if (!model.castSpell(unit.x, unit.y)) throw Error('Giant construct Recall failed');
    const recallAt = battle.nativeSpells!.find((cast) => cast.name === 'Recall')!.firstHit;
    until(0.1);
    if (!model.activateNativeHeroAbility('queen'))
      throw Error('Giant construct arrow activation failed');
    const shot = battle.nativeGiantArrows![0];
    return { shot, recallAt, expires: shot.launched + shot.length / shot.speed };
  };
  return { model, battle, data, queenId, until, launch, towerId: tower.id };
}

/** Actual Queen deployment, Arrow activation and Recall leave a live construct at tower release. */
export function giantConstructRecording(diagonal = true, version = REPLAY_VERSION) {
  const r = giantConstructArena(diagonal, version);
  const { shot, recallAt, expires } = r.launch();
  const times = { contact: 0.6, recalled: recallAt + 0.1, release: 1.6, field: 3.25, after: 5 };
  const snapshots: { at: number; battle: unknown }[] = [];
  for (const key of Object.keys(times) as (keyof typeof times)[]) {
    r.until(times[key]);
    times[key] = r.battle.elapsed;
    snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
  }
  r.model.step(0.05);
  r.model.finishBattle();
  return {
    diagonal,
    ...times,
    recallAt,
    expires,
    queenId: r.queenId,
    shotId: shot.id,
    towerId: r.towerId,
    anchor: diagonal ? { x: 11, y: 6 } : { x: 18, y: 7 },
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
