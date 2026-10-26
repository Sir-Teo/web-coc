import { GameModel, makeBuilding } from '../../src/game/model';
import { emptyArmy, emptySpells } from '../../src/game/army';
import { replayBattle, type ReplayData } from '../../src/game/replay';
import { seconds } from '../../src/game/native-data';
import { spellEndTime, spellRow } from '../../src/game/native-spells';
export function nativeFieldSpellRecording(
  name:
    | 'Rage'
    | 'Haste'
    | 'Healing'
    | 'Poison'
    | 'Clone'
    | 'Invisibility'
    | 'Recall'
    | 'Lightning'
    | 'Earthquake'
    | 'Skeleton Spell'
    | 'Bat Spell',
  level = 1,
) {
  const key = (
      {
        Rage: 'rage',
        Haste: 'haste',
        Healing: 'heal',
        Poison: 'poison',
        Clone: 'clone',
        Invisibility: 'invisibility',
        Recall: 'recall',
        Lightning: 'lightning',
        Earthquake: 'earthquake',
        'Skeleton Spell': 'skeleton',
        'Bat Spell': 'bat',
      } as const
    )[name],
    summons = name === 'Skeleton Spell' || name === 'Bat Spell',
    model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, summons ? 18 : 1),
    makeBuilding(2, 'wall', 10, 10, 1),
  ];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), [key]: 1 };
  model.state.spellLevels = { ...model.state.spellLevels, [key]: level };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [];
  const battle = (model.battle = replayBattle(data.initial)),
    snapshots: { at: number; battle: unknown }[] = [];
  model.activeSpell = key;
  if (!model.castSpell(11.5, 11.5)) throw Error(`${name} cast failed`);
  const cast = battle.nativeSpells![0],
    end = summons
      ? Math.max(
          spellEndTime(cast),
          cast.firstHit + seconds(spellRow(name, level), 'SpawnDuration'),
        )
      : spellEndTime(cast);
  const times = {
    bottle: 0.4,
    landing: 0.9,
    beforeHit: battle.nativeSpells![0].firstHit - 0.05,
    pulsing: name === 'Lightning' ? cast.firstHit + 0.05 : summons ? cast.firstHit + 0.15 : 1.8,
    steady: name === 'Earthquake' ? 45 : Math.max(1, Math.min(10, end / 2)),
    nearEnd: end - 0.6,
    beforeEnd: end - 0.05,
    end,
    afterLive: end + 0.15,
    fieldAfter:
      name === 'Earthquake' ? 180 : end + (name === 'Healing' || name === 'Lightning' ? 8 : 5),
  };
  for (const k of (Object.keys(times) as (keyof typeof times)[]).sort(
    (a, b) => times[a] - times[b],
  )) {
    while (battle.elapsed < times[k] - 1e-9) {
      if (battle.finished) throw Error(`${name} finished before the ${k} checkpoint`);
      model.step(0.05);
    }
    times[k] = battle.elapsed;
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  }
  model.step(0.05);
  model.finishBattle();
  return {
    name,
    key,
    level,
    ...times,
    snapshots,
    anchor: { x: 11.5, y: 11.5 },
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
