import { GameModel, makeBuilding } from '../../src/game/model';
import { emptyArmy } from '../../src/game/army';
import { nativeUnitStats } from '../../src/game/native-units';
import {
  spawnNativeUnit,
  stepNativeUnit,
  type NativeTroopContext,
} from '../../src/game/native-troops';

/** Captured before skipping in-range anchor scans; the first follower captures the shared snapshot. */
export function nativeGroupSnapshotWitness() {
  const m = new GameModel();
  m.state.obstacles = [];
  m.state.buildings = [
    makeBuilding(1, 'townhall', 22, 22, 11),
    makeBuilding(10, 'goldstorage', 20, 20, 1),
  ];
  m.state.army = { ...emptyArmy(), apprenticewarden: 2 };
  m.startBattle(0, true);
  const battle = m.battle!;
  battle.elapsed = 1;
  const goal = battle.buildings.find((b) => b.id === 10)!;
  const ctx: NativeTroopContext = {
    battle,
    buildings: [goal],
    buildingsById: new Map([[goal.id, goal]]),
    passableWalls: new Set(),
    nextId: () => m.state.nextId++,
    troopLevel: (kind) => m.troopLevel(kind),
    damageBuilding: (target, amount, at, spell) => m.damage(target, amount, at, spell),
    effect: () => {},
  };
  const first = spawnNativeUnit(ctx, 'apprenticewarden', 1, 16, 21, 0);
  spawnNativeUnit(ctx, 'giant', 1, 10, 20, 0);
  spawnNativeUnit(ctx, 'giant', 1, 10, 26, 0);
  spawnNativeUnit(ctx, 'swordsman', 1, 10.1, 26, 0);
  const follower = spawnNativeUnit(ctx, 'apprenticewarden', 1, 8, 21, 0);
  first.target = follower.target = goal.id;
  const stats = nativeUnitStats('apprenticewarden', 1);
  const boosted = { damage: stats.dps, speed: stats.speed };
  stepNativeUnit(ctx, first, boosted, 0.05);
  const attack = { attacking: first.attacking, x: first.x, y: first.y };
  // Its housing now makes the southern group heavier. The current tick still
  // reads the old northern group's weight; the next tick captures fresh positions.
  first.x = 10;
  first.y = 26;
  stepNativeUnit(ctx, follower, boosted, 0.05);
  const current = { x: follower.x, y: follower.y };
  follower.x = 8;
  follower.y = 21;
  battle.elapsed += 0.05;
  stepNativeUnit(ctx, follower, boosted, 0.05);
  return { attack, current, next: { x: follower.x, y: follower.y } };
}

/** New arrivals wait for the next snapshot; reused storage must forget dead anchors. */
export function nativeGroupLifecycleWitness() {
  const m = new GameModel();
  m.state.obstacles = [];
  m.state.buildings = [
    makeBuilding(1, 'townhall', 22, 22, 11),
    makeBuilding(10, 'goldstorage', 20, 20, 1),
  ];
  m.state.nextId = 5000;
  m.state.army = { ...emptyArmy(), apprenticewarden: 1 };
  m.startBattle(0, true);
  const battle = m.battle!;
  battle.elapsed = 1;
  const goal = battle.buildings.find((b) => b.id === 10)!;
  const ctx: NativeTroopContext = {
    battle,
    buildings: [goal],
    buildingsById: new Map([[goal.id, goal]]),
    passableWalls: new Set(),
    nextId: () => m.state.nextId++,
    troopLevel: (kind) => m.troopLevel(kind),
    damageBuilding: () => {},
    effect: () => {},
  };
  const follower = spawnNativeUnit(ctx, 'apprenticewarden', 1, 8, 21, 0);
  spawnNativeUnit(ctx, 'giant', 1, 10, 20, 0);
  spawnNativeUnit(ctx, 'giant', 1, 10, 26, 0);
  spawnNativeUnit(ctx, 'swordsman', 1, 10.1, 26, 0);
  follower.target = goal.id;
  const stats = nativeUnitStats('apprenticewarden', 1);
  const boosted = { damage: stats.dps, speed: stats.speed };
  const sample = () => {
    follower.x = 8;
    follower.y = 21;
    stepNativeUnit(ctx, follower, boosted, 0.05);
    return { x: follower.x, y: follower.y };
  };
  const initial = sample();
  for (let i = 0; i < 32; i++) spawnNativeUnit(ctx, 'swordsman', 1, 10 + i / 100, 26, 0);
  const sameTick = sample();
  battle.elapsed += 0.05;
  const grown = sample();
  for (const unit of battle.units) if (unit !== follower) unit.hp = 0;
  spawnNativeUnit(ctx, 'balloon', 1, 12, 22, 0);
  battle.elapsed += 0.05;
  const shrunk = sample();
  // A new wave reuses the retired cells at a different location.
  for (const unit of battle.units) if (unit !== follower) unit.hp = 0;
  spawnNativeUnit(ctx, 'giant', 1, 11, 18, 0);
  battle.elapsed += 0.05;
  return { initial, sameTick, grown, shrunk, moved: sample() };
}
