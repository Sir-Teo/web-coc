import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import type { HeroItemSetup } from '../../src/game/native-heroes';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

export function darkOrbBattle(level = 1, version = REPLAY_VERSION, items?: HeroItemSetup[]) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'cannon', 15, 10, 21),
    makeBuilding(3, 'goldmine', 11, 10, 16),
    makeBuilding(4, 'airdefense', 22, 14, 13),
    makeBuilding(5, 'goldstorage', 24, 5, 16),
    makeBuilding(6, 'cannon', 24, 21, 21),
    makeBuilding(7, 'goldmine', 35, 10, 16),
    makeBuilding(8, 'wall', 18, 12, 18),
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
    { kind: 'prince', level: 1, items: items ?? [{ slug: 'dark-orb', level }] },
  ];
  const battle = (model.battle = replayBattle(data.initial, version));
  if (!model.deployNativeHero('prince', 6.9, 11.5))
    throw Error('Dark Orb Prince deployment failed');
  const princeId = battle.nativeHeroes![0].unitId!;
  const until = (at: number) => {
    for (let remaining = 3000; battle.elapsed < at - 1e-9; remaining--) {
      if (!remaining || battle.finished) throw Error('Dark Orb checkpoint was not reached');
      model.step(0.05);
    }
  };
  return { model, battle, data, princeId, until };
}

export function nativeDarkOrbRecording(level = 1, recall = false, version = REPLAY_VERSION) {
  const r = darkOrbBattle(level, version);
  r.until(0.05);
  const prince = r.battle.units.find((unit) => unit.id === r.princeId)!;
  r.model.activeSpell = 'iceblock';
  if (!r.model.castSpell(prince.x, prince.y)) throw Error('Dark Orb Ice Block failed');
  r.until(0.1);
  if (!r.model.activateNativeHeroAbility('prince')) throw Error('Dark Orb activation failed');
  const launched = r.battle.elapsed;
  if (recall) {
    r.until(0.15);
    r.model.activeSpell = 'recall';
    if (!r.model.castSpell(prince.x, prince.y)) throw Error('Dark Orb Recall failed');
  }
  const times = { portal: 0.25, flight: 0.65, contact: 1.1, impact: 1.5, slow: 4, after: 21 };
  const snapshots: { at: number; battle: unknown }[] = [];
  for (const key of Object.keys(times) as (keyof typeof times)[]) {
    r.until(times[key]);
    times[key] = r.battle.elapsed;
    snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
  }
  const first = snapshots[0].battle as typeof r.battle;
  const shot = first.nativeDarkOrbs?.[0];
  r.model.step(0.05);
  r.model.finishBattle();
  return {
    level,
    launched,
    princeId: r.princeId,
    shotId: shot?.id,
    end: shot ? shot.launched + shot.length / shot.speed : launched + 1.25,
    ...times,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
