import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { heroAbilities, type HeroItemSetup } from '../../src/game/native-heroes';
import { seconds } from '../../src/game/native-data';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

export function frostFlakeBattle(level = 1, version = REPLAY_VERSION, items?: HeroItemSetup[]) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'cannon', 13, 10, 21),
    makeBuilding(3, 'airdefense', 20, 10, 13),
    makeBuilding(4, 'cannon', 27, 10, 21),
    makeBuilding(5, 'airdefense', 35, 10, 13),
    makeBuilding(6, 'mortar', 30, 20, 1),
    makeBuilding(7, 'cannon', 20, 30, 21),
    makeBuilding(8, 'xbow', 34, 30, 1),
    makeBuilding(9, 'goldmine', 10, 14, 16),
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
    { kind: 'champion', level: 1, items: items ?? [{ slug: 'frost-charm', level }] },
  ];
  const battle = (model.battle = replayBattle(data.initial, version));
  if (!model.deployNativeHero('champion', 6.9, 11.5))
    throw Error('Frost Flake Champion deployment failed');
  const championId = battle.nativeHeroes![0].unitId!;
  const until = (at: number) => {
    for (let remaining = 2000; battle.elapsed < at - 1e-9; remaining--) {
      if (!remaining || battle.finished) throw Error('Frost Flake checkpoint was not reached');
      model.step(0.05);
    }
  };
  return { model, battle, data, championId, until };
}

/** Ice Block keeps the actual Cannon target stationary while its full freeze expires. */
export function nativeFrostFlakeRecording(level = 1, recall = false, version = REPLAY_VERSION) {
  const r = frostFlakeBattle(level, version);
  r.until(0.05);
  const champion = r.battle.units.find((u) => u.id === r.championId)!;
  r.model.activeSpell = 'iceblock';
  if (!r.model.castSpell(champion.x, champion.y)) throw Error('Frost Flake Ice Block failed');
  r.until(0.1);
  if (!r.model.activateNativeHeroAbility('champion')) throw Error('Frost Flake activation failed');
  const cast = r.battle.nativeFrostFlakeCasts?.[0],
    ability = heroAbilities(r.battle.nativeHeroes![0]).find((a) => a.name === 'FrostBlast')!,
    launched = r.battle.elapsed,
    firstImpact = cast?.shots[0]?.impact ?? launched + 0.5,
    lastImpact = cast?.shots.length
      ? Math.max(...cast.shots.map((shot) => shot.impact))
      : launched + 2.4,
    freezeSeconds = seconds(ability.row, 'FrostOnHitTime');
  let recallAt: number | undefined;
  if (recall) {
    r.until(0.15);
    r.model.activeSpell = 'recall';
    if (!r.model.castSpell(champion.x, champion.y)) throw Error('Frost Flake Recall failed');
    recallAt = r.battle.nativeSpells!.find((s) => s.name === 'Recall')!.firstHit;
  }
  const times = {
      activation: launched + 0.15,
      fan: launched + 0.3,
      beforeHit: firstImpact - 0.05,
      firstHit: firstImpact + 0.1,
      allHit: lastImpact + 0.1,
      mid: 4,
      beforeThaw: firstImpact + freezeSeconds - 0.05,
      afterThaw: firstImpact + freezeSeconds + 1.2,
      after: lastImpact + freezeSeconds + 1,
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
    name: 'Frost Flake' as const,
    level,
    launched,
    firstImpact,
    lastImpact,
    freezeSeconds,
    recallAt,
    championId: r.championId,
    castId: cast?.id,
    ...times,
    anchor: { x: 14.5, y: 11.5 },
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
