import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import type { HeroItemSetup } from '../../src/game/native-heroes';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

export function spikyBallBattle(level = 1, version = REPLAY_VERSION, items?: HeroItemSetup[]) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'goldmine', 13, 10, 16),
    makeBuilding(3, 'cannon', 20, 10, 21),
    makeBuilding(4, 'elixirstorage', 27, 10, 16),
    makeBuilding(5, 'goldstorage', 35, 10, 16),
    makeBuilding(6, 'elixirstorage', 35, 20, 16),
    makeBuilding(7, 'goldstorage', 27, 20, 16),
    makeBuilding(8, 'elixirstorage', 20, 20, 16),
    makeBuilding(9, 'goldstorage', 13, 20, 16),
  ];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), iceblock: 1, recall: 1, overgrowth: 1, rage: 1 };
  model.state.spellLevels = defaultSpellLevels();
  model.state.king = undefined;
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [
    { kind: 'king', level: 1, items: items ?? [{ slug: 'spiky-ball', level }] },
  ];
  const battle = (model.battle = replayBattle(data.initial, version));
  if (!model.deployNativeHero('king', 6.9, 11.5)) throw Error('Spiky Ball King deployment failed');
  const kingId = battle.nativeHeroes![0].unitId!;
  const until = (at: number) => {
    for (let remaining = 2000; battle.elapsed < at - 1e-9; remaining--) {
      if (!remaining || battle.finished) throw Error('Spiky Ball checkpoint was not reached');
      model.step(0.05);
    }
  };
  return { model, battle, data, kingId, until };
}

export function nativeSpikyBallRecording(level = 1, recall = false, version = REPLAY_VERSION) {
  const r = spikyBallBattle(level, version);
  r.until(0.05);
  const king = r.battle.units.find((unit) => unit.id === r.kingId)!;
  r.model.activeSpell = 'iceblock';
  if (!r.model.castSpell(king.x, king.y)) throw Error('Spiky Ball Ice Block failed');
  r.until(0.1);
  if (!r.model.activateNativeHeroAbility('king')) throw Error('Spiky Ball activation failed');
  const launched = r.battle.elapsed;
  if (recall) {
    r.until(0.15);
    r.model.activeSpell = 'recall';
    if (!r.model.castSpell(king.x, king.y)) throw Error('Spiky Ball Recall failed');
  }
  const times = { flight: 0.3, bounce: 0.9, later: 2.5, landed: 5, after: 9 };
  const snapshots: { at: number; battle: unknown }[] = [];
  for (const key of Object.keys(times) as (keyof typeof times)[]) {
    r.until(times[key]);
    times[key] = r.battle.elapsed;
    snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
  }
  const cast = r.battle.nativeSpikyBallCasts?.[0];
  r.model.step(0.05);
  r.model.finishBattle();
  return {
    level,
    launched,
    kingId: r.kingId,
    ...times,
    castId: cast?.id,
    shots: cast?.shots ?? [],
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
