import { emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

/** Controlled injured, frozen recipient isolates healing casts from pursuit and damage. */
export function druidBattle(level = 1, version = REPLAY_VERSION, x = 5, air = false) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
  model.state.army = { ...emptyArmy(), giant: 3, lavahound: 1, druid: 1 };
  model.state.troopLevels = { ...model.state.troopLevels, giant: 14, lavahound: 6, druid: level };
  model.state.spells = emptySpells();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [];
  const battle = (model.battle = replayBattle(data.initial, version));
  model.activeTroop = air ? 'lavahound' : 'giant';
  if (!model.deploy(10, 11.5)) throw Error('Druid recipient deployment failed');
  const target = battle.units.at(-1)!;
  target.hp = 100;
  (target.native ??= {}).effects = { frozenUntil: 100 };
  model.activeTroop = 'druid';
  if (!model.deploy(x, 11.5)) throw Error('Druid deployment failed');
  const unit = battle.units.at(-1)!,
    seen = new Set<string>(),
    shots: { at: number; damage: number; impact: number }[] = [];
  const step = () => {
    if (battle.finished || battle.elapsed > 15) throw Error('Druid cast checkpoint expired');
    model.step(0.05);
    for (const p of battle.projectiles ?? [])
      if (p.sourceId === unit.id && p.native?.healing && !p.native.bounce && !seen.has(p.id)) {
        seen.add(p.id);
        shots.push({ at: p.launched!, impact: p.impact, damage: p.damage });
      }
  };
  const untilCasts = (n: number) => {
    while (shots.length < n) step();
  };
  return { model, battle, unit, target, data, step, untilCasts, shots };
}

/** Real defense fire wounds the ground or air recipient; no injected battle state. */
export function druidRecording(version = REPLAY_VERSION, level = 1, x = 5, air = false) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, air ? 'airdefense' : 'cannon', 14, 9, air ? 8 : 14),
  ];
  model.state.army = { ...emptyArmy(), giant: 3, lavahound: 1, druid: 1 };
  model.state.troopLevels = { ...model.state.troopLevels, giant: 14, lavahound: 6, druid: level };
  model.state.spells = emptySpells();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [];
  const battle = (model.battle = replayBattle(data.initial, version));
  model.activeTroop = air ? 'lavahound' : 'giant';
  if (!model.deploy(10, 11.5)) throw Error('Real Druid recipient deployment failed');
  const target = battle.units.at(-1)!;
  model.activeTroop = 'druid';
  if (!model.deploy(x, 11.5)) throw Error('Real Druid deployment failed');
  const unit = battle.units.at(-1)!,
    seen = new Set<string>(),
    shots: { at: number; impact: number; damage: number }[] = [],
    snapshots: { at: number; battle: unknown }[] = [];
  const step = () => {
    if (battle.finished || battle.elapsed > 15) throw Error('Real Druid checkpoint expired');
    model.step(0.05);
    for (const p of battle.projectiles ?? [])
      if (p.sourceId === unit.id && p.native?.healing && !p.native.bounce && !seen.has(p.id)) {
        seen.add(p.id);
        shots.push({ at: p.launched!, impact: p.impact, damage: p.damage });
      }
  };
  const snapshot = () => {
    if (snapshots.at(-1)?.at !== battle.elapsed)
      snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
    return battle.elapsed;
  };
  const born = snapshot();
  while (!unit.attacking) step();
  const engaged = snapshot();
  while (!shots.length) step();
  const first = snapshot();
  while (battle.elapsed < shots[0].impact + 0.05 - 1e-9) step();
  const landed = snapshot();
  while (shots.length < 2) step();
  const second = snapshot();
  step();
  model.finishBattle();
  return {
    id: unit.id,
    targetId: target.id,
    born,
    engaged,
    first,
    landed,
    second,
    shots,
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}

/** A low-tier multi Inferno wounds both allies without ending the live thirty-second evolution. */
export function druidEvolutionRecording(level = 1, version = REPLAY_VERSION) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    { ...makeBuilding(2, 'inferno', 14, 9, 1), infernoMode: 'multi' },
  ];
  model.state.army = { ...emptyArmy(), giant: 2, druid: 1 };
  model.state.troopLevels = { ...model.state.troopLevels, giant: 1, druid: level };
  model.state.spells = emptySpells();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [];
  const battle = (model.battle = replayBattle(data.initial, version));
  model.activeTroop = 'giant';
  if (!model.deploy(10, 11.5)) throw Error('Evolution Giant deployment failed');
  model.activeTroop = 'druid';
  if (!model.deploy(5, 11.5)) throw Error('Evolution Druid deployment failed');
  const unit = battle.units.at(-1)!,
    snapshots: { at: number; battle: unknown }[] = [];
  const step = () => {
    if (battle.finished || battle.elapsed > 38 || unit.hp <= 0)
      throw Error(`Live Druid evolution expired at${battle.elapsed} hp${unit.hp}`);
    model.step(0.05);
  };
  const snapshot = () => {
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
    return battle.elapsed;
  };
  const born = snapshot();
  while (battle.elapsed < 29.95 - 1e-9) step();
  const before = snapshot();
  step();
  const transformed = snapshot();
  if (unit.kind !== 'bear') throw Error('Druid transformation did not happen');
  while (!(unit.native!.attacks ?? 0)) step();
  const first = snapshot();
  step();
  model.finishBattle();
  return {
    id: unit.id,
    born,
    before,
    transformed,
    first,
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
