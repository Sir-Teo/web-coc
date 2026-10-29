import { GameModel, makeBuilding } from '../../src/game/model';
import { emptyArmy } from '../../src/game/army';
import { nativeUnitStats } from '../../src/game/native-units';
import { TROOPS } from '../../src/game/data';
import { distance2D } from '../../src/game/distance';
import { friendlyCombatant } from '../../src/game/friendly-unit';
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

/** Compare clustered, sparse and boundary layouts with an independent full housing scan. */
export function nativeGroupHousingWitness() {
  const m = new GameModel();
  m.state.obstacles = [];
  m.state.buildings = [makeBuilding(1, 'townhall', 40, 40, 11)];
  m.state.nextId = 5000;
  m.state.army = { ...emptyArmy(), apprenticewarden: 1 };
  m.startBattle(0, true);
  const battle = m.battle!;
  const goal = battle.buildings[0];
  const ctx: NativeTroopContext = {
    battle,
    buildings: [goal],
    buildingsById: new Map([[goal.id, goal]]),
    passableWalls: new Set(),
    nextId: () => m.state.nextId++,
    troopLevel: () => 1,
    damageBuilding: () => {},
    effect: () => {},
  };
  const follower = spawnNativeUnit(ctx, 'apprenticewarden', 1, 8, 21, 0);
  const allies = Array.from({ length: 96 }, (_, i) =>
    spawnNativeUnit(ctx, i % 3 ? 'giant' : 'swordsman', 1, 10, 20, 0),
  );
  const stats = nativeUnitStats('apprenticewarden', 1);
  let seed = 54321;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const samples = [];
  for (let phase = 0; phase < 24; phase++) {
    battle.elapsed = phase + 1;
    follower.x = 8;
    follower.y = 21;
    follower.target = goal.id;
    for (let i = 0; i < allies.length; i++) {
      const ally = allies[i];
      // Alternate tight clusters and scattered cells, including exact radius edges and
      // points immediately either side. Later phases reuse the buckets with deaths/recalls.
      const spread = phase % 2 ? 24 : 1;
      ally.x = 5 + (i % 3) * 5 + random() * spread;
      ally.y = 15 + (i % 2) * 10 + random() * spread;
      ally.hp = phase > 5 && i % 7 === 0 ? 0 : ally.maxHp;
      if (phase > 10 && i % 11 === 0) ally.native!.recalled = true;
      else delete ally.native!.recalled;
    }
    for (let i = 0; i < 6; i++) {
      allies[i].x = 10 + [0, 5, 5 - 1e-12, 5 + 1e-12, 3, 3][i];
      allies[i].y = 20 + [0, 0, 0, 0, 4, 4 + 1e-12][i];
    }
    if (phase % 3 === 0) battle.units.reverse();
    const living = battle.units.filter(
      (u) =>
        u.hp > 0 && (!battle.nativeFriendlyEligibility || friendlyCombatant(u, battle.elapsed)),
    );
    let anchor: typeof follower | undefined;
    let weight = 0;
    for (const ally of living) {
      if (
        ally === follower ||
        nativeUnitStats(ally.kind, 1).groups ||
        distance2D(ally.x - follower.x, ally.y - follower.y) > stats.groupRange
      )
        continue;
      let housing = 0;
      for (const other of living)
        if (distance2D(other.x - ally.x, other.y - ally.y) <= stats.groupRadius)
          housing += TROOPS[other.kind].space;
      if (housing > weight) {
        anchor = ally;
        weight = housing;
      }
    }
    if (!anchor) throw Error('Housing witness requires an anchor');
    const dx = anchor.x - follower.x,
      dy = anchor.y - follower.y;
    const length = distance2D(dx, dy);
    const travel = Math.min(stats.speed * 0.05, Math.max(0, length - 1));
    const expected = {
      x: follower.x + (dx / length) * travel,
      y: follower.y + (dy / length) * travel,
    };
    stepNativeUnit(ctx, follower, { damage: stats.dps, speed: stats.speed }, 0.05);
    samples.push({ expected, actual: { x: follower.x, y: follower.y } });
  }
  return samples;
}
