import { GameModel, makeBuilding } from '../../src/game/model';
import { emptyArmy, emptySpells } from '../../src/game/army';
import type { ReplayData } from '../../src/game/replay';
/** Four real casts damage a mine and break a wall; no health or combat state is injected. */
export function nativeEarthquakeRecording(level = 1) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 37, 37, 1),
    makeBuilding(2, 'goldmine', 10, 10, 8),
    makeBuilding(3, 'wall', 16, 11, 10),
  ];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), earthquake: 4 };
  model.state.spellLevels = { ...model.state.spellLevels, earthquake: level };
  model.startBattle(0, true);
  const battle = model.battle!,
    snapshots: { at: number; battle: unknown }[] = [],
    until = (at: number) => {
      while (battle.elapsed < at - 1e-9) model.step(0.05);
    },
    snapshot = () =>
      snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  const impacts: number[] = [];
  for (let i = 0; i < 4; i++) {
    model.activeSpell = 'earthquake';
    if (!model.castSpell(13.5, 11.5)) throw Error('Earthquake cast failed');
    const cast = battle.nativeSpells!.at(-1)!;
    until(cast.firstHit + (cast.total - 1) * cast.interval + 0.05);
    snapshot();
    impacts.push(battle.elapsed);
    until(cast.castAt + 5);
    model.step(0.05);
  }
  until(45);
  snapshot();
  const scars = battle.elapsed;
  model.step(0.05);
  model.finishBattle();
  return {
    level,
    impacts,
    scars,
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
