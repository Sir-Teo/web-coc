import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding, type Building } from '../../src/game/model';
import type { HeroItemSetup } from '../../src/game/native-heroes';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

export function seekingShieldBattle(
  level = 1,
  version = REPLAY_VERSION,
  items?: HeroItemSetup[],
  buildings?: Building[],
) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = buildings ?? [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'cannon', 13, 10, 21),
    makeBuilding(3, 'airdefense', 20, 10, 13),
    makeBuilding(4, 'cannon', 27, 10, 21),
    makeBuilding(5, 'xbow', 35, 20, 1),
    makeBuilding(6, 'goldmine', 10, 14, 16),
    makeBuilding(7, 'wall', 9, 11, 18),
  ];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), iceblock: 1, recall: 1, overgrowth: 1 };
  model.state.spellLevels = defaultSpellLevels();
  model.state.king = undefined;
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [
    { kind: 'champion', level: 1, items: items ?? [{ slug: 'seeking-shield', level }] },
  ];
  const battle = (model.battle = replayBattle(data.initial, version));
  if (!model.deployNativeHero('champion', 6.9, 11.5))
    throw Error('Seeking Shield Champion deployment failed');
  const championId = battle.nativeHeroes![0].unitId!;
  const until = (at: number) => {
    for (let remaining = 2000; battle.elapsed < at - 1e-9; remaining--) {
      if (!remaining || battle.finished) throw Error('Seeking Shield checkpoint was not reached');
      model.step(0.05);
    }
  };
  return { model, battle, data, championId, until };
}

export function nativeSeekingShieldRecording(level = 1, recall = false, version = REPLAY_VERSION) {
  const r = seekingShieldBattle(level, version);
  r.until(0.05);
  const champion = r.battle.units.find((unit) => unit.id === r.championId)!;
  r.model.activeSpell = 'iceblock';
  if (!r.model.castSpell(champion.x, champion.y)) throw Error('Seeking Shield Ice Block failed');
  r.until(0.1);
  if (!r.model.activateNativeHeroAbility('champion'))
    throw Error('Seeking Shield activation failed');
  const castAt = r.battle.elapsed;
  if (recall) {
    r.until(0.15);
    r.model.activeSpell = 'recall';
    if (!r.model.castSpell(champion.x, champion.y)) throw Error('Seeking Shield Recall failed');
  }
  const times = { pending: 0.8, flight: 1.2, bounce: 1.65, landed: 3.5, after: 7 };
  const snapshots: { at: number; battle: unknown }[] = [];
  for (const key of Object.keys(times) as (keyof typeof times)[]) {
    r.until(times[key]);
    times[key] = r.battle.elapsed;
    snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
  }
  const cast = r.battle.nativeSeekingShieldCasts?.[0];
  r.model.step(0.05);
  r.model.finishBattle();
  return {
    level,
    castAt,
    launchAt: cast?.launchAt ?? castAt + 0.933,
    championId: r.championId,
    castId: cast?.id,
    ...times,
    shots: cast?.shots ?? [],
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}

/** Real source Monolith fire triggers the ability; no manual activation is recorded. */
export function automaticSeekingShieldRecording() {
  const r = seekingShieldBattle(18, undefined, undefined, [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'monolith', 13, 10, 1),
    makeBuilding(3, 'monolith', 20, 10, 1),
    makeBuilding(4, 'monolith', 13, 17, 1),
    makeBuilding(5, 'monolith', 20, 17, 1),
  ]);
  for (let steps = 0; !r.battle.nativeSeekingShieldCasts?.length && steps < 600; steps++)
    r.model.step(0.05);
  const cast = r.battle.nativeSeekingShieldCasts?.[0];
  if (!cast) throw Error('Source Monolith fire did not trigger Seeking Shield');
  const times = { flight: cast.at + 0.05, later: cast.at + 1.1, after: cast.at + 5 };
  const snapshots: { at: number; battle: unknown }[] = [];
  for (const key of Object.keys(times) as (keyof typeof times)[]) {
    r.until(times[key]);
    times[key] = r.battle.elapsed;
    snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
  }
  r.model.step(0.05);
  r.model.finishBattle();
  return {
    championId: r.championId,
    castAt: cast.at,
    launchAt: cast.launchAt,
    castId: cast.id,
    ...times,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
