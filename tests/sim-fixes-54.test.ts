import { describe, expect, it } from 'vitest';
import {
  GameModel,
  MAX_REPLAY_BACKLOG_SECONDS,
  STALLED_BATTLE_SECONDS,
  findPath,
  makeBuilding,
  separateUnits,
  type Unit,
} from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { TROOP_KEYS } from '../src/game/data';
import { REPLAY_VERSION, compatibleReplayVersion, replayBattle } from '../src/game/replay';
import { findSubtilePath } from '../src/game/subtile-path';

const unit = (id: number, x: number, y: number, kind: Unit['kind'] = 'swordsman'): Unit => ({
  id,
  kind,
  x,
  y,
  hp: 100,
  maxHp: 100,
  cooldown: 0,
  target: null,
  path: [],
  pathAt: 0,
  attacking: false,
});

describe('version 54 rules', () => {
  it('is the current version and keeps version 53 playable without the new rules', () => {
    expect(REPLAY_VERSION).toBe(54);
    expect(compatibleReplayVersion(53)).toBe(true);
    expect(compatibleReplayVersion(54)).toBe(true);
    const setup = {
      index: 0,
      practice: false,
      buildings: [makeBuilding(1, 'goldmine', 10, 10)],
      army: emptyArmy(),
      spells: emptySpells(),
      troopLevels: emptyArmy(),
      nextId: 100,
    };
    const current = replayBattle(setup);
    expect(current.separationCap).toBe(true);
    expect(current.stalledSupportEnds).toBe(true);
    expect(current.dropFallenPaths).toBe(true);
    const old = replayBattle(setup, 53);
    expect(old.separationCap).toBeUndefined();
    expect(old.stalledSupportEnds).toBeUndefined();
    expect(old.dropFallenPaths).toBeUndefined();
  });

  it('caps how far crowd separation moves one unit per call', () => {
    const blob = () => Array.from({ length: 60 }, (_, i) => unit(i + 1, 20 + (i % 3) * 0.01, 20));
    const moved = (units: Unit[]) =>
      Math.max(...units.map((u, i) => Math.hypot(u.x - (20 + (i % 3) * 0.01), u.y - 20)));
    const free = blob();
    separateUnits(free, []);
    const capped = blob();
    separateUnits(capped, [], false, 0.1);
    expect(moved(free)).toBeGreaterThan(0.3);
    expect(moved(capped)).toBeLessThanOrEqual(0.1 + 1e-9);
    // Separation still spreads the blob.
    expect(moved(capped)).toBeGreaterThan(0.05);
  });

  it('ends a battle held open only by stalled summons', () => {
    const m = new GameModel();
    m.state.obstacles = [];
    m.state.army = { ...emptyArmy(), swordsman: 1 };
    m.state.spells = emptySpells();
    m.startBattle(0, true);
    const b = m.battle!;
    b.practice = false; // No deadline, like a campaign battle.
    b.defenders = [];
    // One building walled in on every side by walls a summon cannot break in time.
    b.buildings = [makeBuilding(900, 'goldmine', 20, 20, 1)];
    let id = 901;
    for (let x = 18; x <= 24; x++)
      for (const y of [18, 24]) b.buildings.push(makeBuilding(id++, 'wall', x, y, 1));
    for (let y = 19; y <= 23; y++)
      for (const x of [18, 24]) b.buildings.push(makeBuilding(id++, 'wall', x, y, 1));
    for (const w of b.buildings) if (w.kind === 'wall') w.hp = w.maxHp = 1e9;
    b.remaining = { ...emptyArmy() };
    b.started = true;
    b.units.push({ ...unit(5000, 10, 21), summoned: true });
    const run = (seconds: number) => {
      for (let t = 0; t < seconds * 20 && !b.finished; t++) m.step(0.05);
    };
    run(STALLED_BATTLE_SECONDS - 5);
    expect(b.finished).toBeFalsy();
    run(10);
    expect(b.finished).toBe(true);
  });

  it('keeps a stalled summon fighting under version 53 rules', () => {
    const m = new GameModel();
    m.state.obstacles = [];
    m.state.army = { ...emptyArmy(), swordsman: 1 };
    m.startBattle(0, true);
    const b = m.battle!;
    delete b.stalledSupportEnds;
    b.practice = false;
    b.defenders = [];
    b.buildings = [makeBuilding(900, 'goldmine', 20, 20, 1)];
    let id = 901;
    for (let x = 18; x <= 24; x++)
      for (const y of [18, 24]) b.buildings.push(makeBuilding(id++, 'wall', x, y, 1));
    for (let y = 19; y <= 23; y++)
      for (const x of [18, 24]) b.buildings.push(makeBuilding(id++, 'wall', x, y, 1));
    for (const w of b.buildings) if (w.kind === 'wall') w.hp = w.maxHp = 1e9;
    b.remaining = { ...emptyArmy() };
    b.started = true;
    b.units.push({ ...unit(5000, 10, 21), summoned: true });
    for (let t = 0; t < (STALLED_BATTLE_SECONDS + 10) * 20; t++) m.step(0.05);
    expect(b.finished).toBeFalsy();
  });
});

describe('route grid cache', () => {
  it('never serves one layout for another with the same ids and size', () => {
    // Same ids and list length, different footprints (two campaign stages of equal size).
    const a = [makeBuilding(1000, 'goldstorage', 10, 5), makeBuilding(1001, 'goldmine', 30, 30)];
    const b = [makeBuilding(1000, 'goldstorage', 10, 20), makeBuilding(1001, 'goldmine', 30, 30)];
    const start = { x: 11.5, y: 2 },
      goal = { x: 11.5, y: 28 };
    const first = findSubtilePath(start, goal, a, 0.5);
    const second = findSubtilePath(start, goal, b, 0.5);
    expect(second).toEqual(findSubtilePath(start, goal, structuredClone(b), 0.5));
    expect(second).not.toEqual(first);
    const legacyA = findPath(start, goal, a, 0.5);
    const legacyB = findPath(start, goal, b, 0.5);
    expect(legacyB).toEqual(findPath(start, goal, structuredClone(b), 0.5));
    expect(legacyB).not.toEqual(legacyA);
  });

  it('returns independent waypoint copies from the route memo', () => {
    const walls = [makeBuilding(1, 'wall', 5, 5), makeBuilding(2, 'townhall', 10, 10)];
    const one = findSubtilePath({ x: 1, y: 1 }, walls[1], walls, 0.4);
    one.shift();
    const two = findSubtilePath({ x: 1, y: 1 }, walls[1], walls, 0.4);
    expect(two.length).toBe(one.length + 1);
    expect(two[1]).not.toBe(one[0]);
  });
});

describe('replay playback', () => {
  function recorded() {
    const m = new GameModel();
    m.state.obstacles = [];
    m.state.army = { ...emptyArmy(), swordsman: 20 };
    m.state.troopLevels = Object.fromEntries(TROOP_KEYS.map((k) => [k, 1])) as typeof m.state.army;
    m.startBattle(0);
    m.activeTroop = 'swordsman';
    for (let i = 0; i < 20; i++) {
      m.deploy(2 + (i % 5) * 0.3, 2 + Math.floor(i / 5) * 0.3);
      m.step(0.05);
    }
    for (let t = 0; t < 200 && !m.battle!.finished; t++) m.step(0.05);
    if (!m.battle!.finished) m.finishBattle();
    return m;
  }

  it('reports replayed deploys as passive changes', () => {
    const m = recorded();
    const record = m.state.raidLog![0];
    m.returnHome();
    const kinds: boolean[] = [];
    m.onChange = (passive) => kinds.push(passive);
    expect(m.startReplay(record.id)).toBe(true);
    kinds.length = 0;
    m.setReplaySpeed(4);
    kinds.length = 0;
    for (let i = 0; i < 40; i++) m.step(0.05);
    expect(kinds.filter((p) => p).length).toBeGreaterThan(5);
  });

  it('bounds the playback backlog and clears it on seek', () => {
    const m = recorded();
    const record = m.state.raidLog![0];
    m.returnHome();
    m.startReplay(record.id);
    m.setReplaySpeed(4);
    m.step(30);
    const budget = () => (m as unknown as { replayBudget: number }).replayBudget;
    expect(budget()).toBeLessThanOrEqual(MAX_REPLAY_BACKLOG_SECONDS);
    m.seekReplay(1);
    expect(budget()).toBe(0);
  });
});
