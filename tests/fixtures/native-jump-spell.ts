import { GameModel, makeBuilding } from '../../src/game/model';
import { emptyArmy, emptySpells } from '../../src/game/army';
import { replayBattle, type ReplayData } from '../../src/game/replay';
/** An actual Jump cast with no deployed actors keeps original art and combat timelines inspectable. */
export function nativeJumpRecording(level = 1) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 1),
    makeBuilding(2, 'wall', 10, 10, 1),
  ];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), jump: 1 };
  model.state.spellLevels = { ...model.state.spellLevels, jump: level };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [];
  const battle = (model.battle = replayBattle(data.initial)),
    duration = 20 * level;
  const times = {
    bottle: 0.4,
    landing: 0.9,
    beforeHit: 1.45,
    pulsing: 1.8,
    steady: duration / 2,
    afterLive: duration + 1.7,
    fieldAfter: duration + 4.6,
    beforeExpiry: duration + 1.45,
    expiry: duration + 1.5,
    afterExpiry: duration + 1.6,
  };
  const snapshots: { at: number; battle: unknown }[] = [];
  model.activeSpell = 'jump';
  if (!model.castSpell(11.5, 11.5)) throw Error('Jump cast failed');
  for (const key of (Object.keys(times) as (keyof typeof times)[]).sort(
    (a, b) => times[a] - times[b],
  )) {
    while (battle.elapsed < times[key] - 1e-9) model.step(0.05);
    times[key] = battle.elapsed;
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  }
  model.step(0.05);
  model.finishBattle();
  return {
    level,
    duration,
    ...times,
    snapshots,
    anchor: { x: 11.5, y: 11.5 },
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
