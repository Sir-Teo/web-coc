import { GameModel, makeBuilding } from '../../src/game/model';
import { emptyArmy, emptySpells } from '../../src/game/army';
import { replayBattle, type ReplayData } from '../../src/game/replay';
import { spellEndTime } from '../../src/game/native-spells';
export function nativeFieldSpellRecording(
  name: 'Rage' | 'Haste' | 'Healing' | 'Poison',
  level = 1,
) {
  const key = ({ Rage: 'rage', Haste: 'haste', Healing: 'heal', Poison: 'poison' } as const)[name],
    model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 1),
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
  const end = spellEndTime(battle.nativeSpells![0]);
  const times = {
    bottle: 0.4,
    landing: 0.9,
    beforeHit: 1.45,
    pulsing: 1.8,
    steady: Math.min(10, end / 2),
    nearEnd: end - 0.6,
    beforeEnd: end - 0.05,
    end,
    afterLive: end + 0.15,
    fieldAfter: end + (name === 'Healing' ? 8 : 5),
  };
  for (const k of (Object.keys(times) as (keyof typeof times)[]).sort(
    (a, b) => times[a] - times[b],
  )) {
    while (battle.elapsed < times[k] - 1e-9) model.step(0.05);
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
