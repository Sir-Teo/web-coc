import { emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding, type Battle, type Building } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

/** A real Thrower shoots over a closed wall ring, then destroys a second mine outside it. */
export function ruinWitchRubbleBattle(
  level = 1,
  version = REPLAY_VERSION,
  open = false,
  outside = true,
  jump = false,
) {
  const model = new GameModel(),
    walls: Building[] = [];
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  let id = 10;
  for (let x = 11; x <= 19; x++) {
    walls.push(makeBuilding(id++, 'wall', x, 11, 18));
    walls.push(makeBuilding(id++, 'wall', x, 19, 18));
  }
  for (let y = 12; y < 19; y++) {
    if (!open || y !== 15) walls.push(makeBuilding(id++, 'wall', 11, y, 18));
    walls.push(makeBuilding(id++, 'wall', 19, y, 18));
  }
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'goldmine', 14, 14, 1),
    ...(outside ? [makeBuilding(3, 'goldmine', 6, 22, 1)] : []),
    makeBuilding(4, 'barracks', 26, 15, 16),
    ...walls,
  ];
  model.state.army = { ...emptyArmy(), ruinwitch: 1, thrower: 1, archer: 1 };
  model.state.spells = { ...emptySpells(), jump: jump ? 1 : 0 };
  model.state.troopLevels = { ...model.state.troopLevels, ruinwitch: level, thrower: 1 };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [];
  const battle = (model.battle = replayBattle(data.initial, version));
  model.activeTroop = 'ruinwitch';
  if (!model.deploy(8.5, 15.5)) throw Error('Rubble-route Witch deployment failed');
  const unit = battle.units.at(-1)!;
  model.activeTroop = 'thrower';
  if (!model.deploy(9, 15.5)) throw Error('Rubble-route Thrower deployment failed');
  const step = (dt = 0.05) => {
    if (battle.finished || battle.elapsed > 60) throw Error('Rubble-route checkpoint expired');
    model.step(dt);
  };
  const until = (at: number) => {
    while (battle.elapsed < at - 1e-9) step();
  };
  return { model, battle, data, unit, step, until };
}

/** Unmodified player inputs supply every portable snapshot. */
export function ruinWitchRubbleRecording(level = 1, version = REPLAY_VERSION, open = false) {
  const r = ruinWitchRubbleBattle(level, version, open),
    snapshots: { at: number; battle: Battle }[] = [];
  for (const at of [1, 3, 5, 7, 11.5, 15, 20]) {
    r.until(at);
    snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
  }
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
