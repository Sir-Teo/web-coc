import { GameModel, makeBuilding } from '../../src/game/model';
import { emptyArmy, emptySpells } from '../../src/game/army';
import { replayBattle, type ReplayData } from '../../src/game/replay';

/** Actual Yeti damage/Furnace timers spawn a mite that jumps at a defending Queen. */
export function nativeMiteJumpRecording(kind: 'yetimite' | 'firemite') {
  const parent = kind === 'yetimite' ? 'yeti' : 'furnace',
    level = kind === 'yetimite' ? 1 : 4;
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
  model.state.army = {
    ...emptyArmy(),
    giant: 1,
    [parent]: 1,
    ...(kind === 'firemite' ? { golem: 1 } : {}),
  };
  model.state.troopLevels = { ...model.state.troopLevels, [parent]: level, golem: 1 };
  model.state.spells = emptySpells();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [];
  data.initial.defendingHeroes = [
    { kind: 'queen', level: kind === 'yetimite' ? 50 : 1, x: 9, y: 6.5 },
  ];
  const battle = (model.battle = replayBattle(data.initial));
  const step = () => {
    if (battle.finished || battle.elapsed > 30)
      throw Error(`${kind} defender leap checkpoint missing at ${battle.elapsed}`);
    model.step(0.05);
  };
  model.activeTroop = parent;
  if (!model.deploy(13, 6.5)) throw Error('Mite parent deployment failed');
  const parentId = battle.units.at(-1)!.id;
  if (kind === 'firemite') {
    step();
    model.activeTroop = 'golem';
    if (!model.deploy(7.5, 6.5)) throw Error('Mite tank deployment failed');
  }
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () => ({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  let child;
  while (!(child = battle.units.find((u) => u.kind === kind && u.native?.owner === parentId)))
    step();
  snapshots.push(snapshot());
  const spawned = battle.elapsed,
    childId = child.id;
  let previous = snapshot(),
    shot;
  while (!(shot = battle.projectiles?.find((p) => p.sourceId === childId && p.targetDefender))) {
    previous = snapshot();
    step();
  }
  if (!child.spent || child.hp > 0) throw Error('Mite body did not yield to its leap');
  snapshots.push(previous, snapshot());
  const beforeJump = previous.at,
    inFlight = battle.elapsed;
  while (battle.elapsed < shot.impact) step();
  snapshots.push(snapshot());
  const landed = battle.elapsed;
  let burning: number | undefined;
  if (kind === 'firemite') {
    const burn = battle.nativeSpells?.find((c) => c.name === 'FireSpiritBurn');
    if (!burn || burn.level !== level) throw Error('Firemite source burn was lost');
    while (burn.hits < 1) step();
    snapshots.push(snapshot());
    burning = battle.elapsed;
  }
  step();
  model.finishBattle();
  return {
    kind,
    level,
    spawned,
    beforeJump,
    inFlight,
    landed,
    burning,
    childId,
    parentId,
    targetId: shot.targetId,
    shotId: shot.id,
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
