import { emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding, type Battle } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

/** Real Wizard damage creates rubble; the Ruin Witch then completes her ordinary summon. */
export function attackingRuinKnightBattle(
  level = 1,
  version = REPLAY_VERSION,
  controlled = true,
  targetX = 16,
) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 100;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'goldmine', 11, 10, 1),
    makeBuilding(3, 'barracks', targetX, 10, 16),
  ];
  model.state.army = { ...emptyArmy(), ruinwitch: 1, wizard: 1, archer: 1 };
  model.state.troopLevels = { ...model.state.troopLevels, ruinwitch: level, wizard: 1 };
  model.state.spells = emptySpells();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [];
  const battle = (model.battle = replayBattle(data.initial, version));
  model.activeTroop = 'ruinwitch';
  if (!model.deploy(9, 12)) throw Error('Ruin Witch deployment failed');
  const parent = battle.units.at(-1)!;
  model.activeTroop = 'wizard';
  if (!model.deploy(9, 11.5)) throw Error('Rubble Wizard deployment failed');
  const step = (dt = 0.05) => {
    if (battle.finished || battle.elapsed > 90) throw Error('Ruin Knight checkpoint expired');
    const hold = () => {
      if (!controlled || !battle.units.some((u) => u.kind === 'ruinknight')) return;
      for (const other of battle.units)
        if (other.kind !== 'ruinknight') (other.native!.effects ??= {}).frozenUntil = 100;
    };
    hold();
    model.step(dt);
    hold();
  };
  while (!battle.units.some((u) => u.kind === 'ruinknight')) step();
  const unit = battle.units.find((u) => u.kind === 'ruinknight')!;
  const until = (at: number) => {
    while (battle.elapsed < at - 1e-9) step();
  };
  const untilAttacks = (count: number) => {
    while ((unit.native?.attacks ?? 0) < count) step();
  };
  return { model, battle, data, parent, unit, step, until, untilAttacks };
}

/** Portable witnesses use only deployment inputs, natural rubble, summons and attacks. */
export function attackingRuinKnightRecording(level = 1, version = REPLAY_VERSION, targetX = 16) {
  const r = attackingRuinKnightBattle(level, version, false, targetX),
    snapshots: { at: number; battle: Battle }[] = [];
  const snapshot = () => {
    if (snapshots.at(-1)?.at !== r.battle.elapsed)
      snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  const born = snapshot();
  while (!r.unit.attacking) r.step();
  const engaged = snapshot();
  r.untilAttacks(1);
  const first = snapshot();
  r.untilAttacks(2);
  const second = snapshot();
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    parentId: r.parent.id,
    born,
    engaged,
    first,
    second,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
