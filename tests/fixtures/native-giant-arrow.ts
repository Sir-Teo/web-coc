import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

export function giantArrowBattle(level = 1, version = REPLAY_VERSION) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'goldmine', 14, 10, 16),
    makeBuilding(3, 'airdefense', 20, 10, 13),
    makeBuilding(4, 'elixirstorage', 26, 10, 16),
    makeBuilding(5, 'wall', 18, 11, 18),
    makeBuilding(6, 'bomb', 17, 11, 1),
    makeBuilding(7, 'goldstorage', 20, 17, 16),
    makeBuilding(8, 'goldstorage', 40, 10, 16),
  ];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), recall: 1, rage: 1, overgrowth: 1 };
  model.state.spellLevels = defaultSpellLevels();
  model.state.king = undefined;
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [{ kind: 'queen', level: 1, items: [{ slug: 'piercing-arrow', level }] }];
  const battle = (model.battle = replayBattle(data.initial, version));
  if (!model.deployNativeHero('queen', 6.9, 11.5))
    throw Error('Giant Arrow Queen deployment failed');
  const queenId = battle.nativeHeroes![0].unitId!;
  const until = (at: number) => {
    for (let remaining = 2000; battle.elapsed < at - 1e-9; remaining--) {
      if (!remaining || battle.finished) throw Error('Giant Arrow checkpoint was not reached');
      model.step(0.05);
    }
  };
  return { model, battle, data, queenId, until };
}

export function nativeGiantArrowRecording(level = 1, recall = false, version = REPLAY_VERSION) {
  const r = giantArrowBattle(level, version);
  let activateAt = 0.1;
  if (recall) {
    r.until(0.05);
    r.model.activeSpell = 'recall';
    const unit = r.battle.units.find((u) => u.id === r.queenId)!;
    if (!r.model.castSpell(unit.x, unit.y)) throw Error('Giant Arrow Recall failed');
    activateAt = r.battle.nativeSpells!.find((cast) => cast.name === 'Recall')!.firstHit - 0.35;
  }
  r.until(activateAt);
  if (!r.model.activateNativeHeroAbility('queen')) throw Error('Giant Arrow activation failed');
  const launched = r.battle.elapsed,
    shot = r.battle.nativeGiantArrows?.[0],
    end = shot ? shot.launched + shot.length / shot.speed : launched + 1.2,
    times = {
      launch: launched + 0.05,
      airborne: launched + 0.3,
      late: launched + 0.8,
      beforeEnd: end - 0.05,
      afterEnd: end + 0.05,
      tail: end + 0.4,
      cleared: end + 0.85,
    },
    snapshots: { at: number; battle: unknown }[] = [];
  for (const key of (Object.keys(times) as (keyof typeof times)[]).sort(
    (a, b) => times[a] - times[b],
  )) {
    r.until(times[key]);
    times[key] = r.battle.elapsed;
    snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
  }
  r.model.step(0.05);
  r.model.finishBattle();
  return {
    name: 'Giant Arrow' as const,
    level,
    launched,
    end,
    ...times,
    queenId: r.queenId,
    anchor: { x: 21.5, y: 11.5 },
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
