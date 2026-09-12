import { describe, it, expect } from 'vitest';
import { GameModel, makeBuilding, findPath, type Unit, type FX } from '../src/game/model';
import {
  BUILDINGS,
  TROOP_KEYS,
  maxCountFor,
  maxLevelFor,
  upgradeCost,
  upgradeSeconds,
  type TroopKind,
} from '../src/game/data';
import { stepTraps } from '../src/game/traps';
import {
  spawnSkeleton,
  stepDefenders,
  stepAttackerVsDefenders,
  damageDefenders,
} from '../src/game/defenders';
import { skeletonStats, type SkeletonMode } from '../src/game/skeleton-stats';
import { launchProjectile, stepProjectiles } from '../src/game/projectiles';
import { startSpellAura } from '../src/game/spell-effects';
import { validateSave } from '../src/game/save';
import { validateReplay, REPLAY_VERSION } from '../src/game/replay';
import { makeReplayFile } from '../src/game/replay-file';
import { requiredTownHall } from '../src/game/progression';
import { skeletonCount } from '../src/game/skeleton-stats';
import { obsidianBattle } from './fixtures/obsidian-battle';

function arena(mode: SkeletonMode = 'ground', level = 2) {
  const m = new GameModel();
  m.startBattle(0, true);
  const b = m.battle!,
    trap = makeBuilding(9000, 'skeletontrap', 10, 10, level);
  trap.skeletonMode = mode;
  b.buildings = [trap, makeBuilding(9001, 'townhall', 30, 30)];
  b.started = true;
  const effects: FX[] = [];
  m.onEffect = (fx) => effects.push(fx);
  return { m, b, trap, effects };
}
function unit(m: GameModel, kind: TroopKind = 'swordsman', x = 14, y = 10.5) {
  const u: Unit = {
    id: 10000 + m.battle!.units.length,
    kind,
    x,
    y,
    hp: 5000,
    maxHp: 5000,
    cooldown: 99,
    target: null,
    path: [],
    pathAt: 0,
    attacking: false,
  };
  m.battle!.units.push(u);
  return u;
}
it('uses the TH8 count, level ceiling, instant placement and native upgrade timer', () => {
  expect(Array.from({ length: 8 }, (_, i) => maxCountFor('skeletontrap', i + 1))).toEqual([
    0, 0, 0, 0, 0, 0, 0, 2,
  ]);
  expect(Array.from({ length: 8 }, (_, i) => maxLevelFor('skeletontrap', i + 1))).toEqual([
    0, 0, 0, 0, 0, 0, 0, 2,
  ]);
  expect(BUILDINGS.skeletontrap).toMatchObject({
    size: 1,
    cost: 6000,
    build: 0,
    trap: { trigger: 5, delay: 0.6, minHousing: 1 },
  });
  expect(upgradeCost('skeletontrap', 1)).toBe(250000);
  expect(upgradeSeconds('skeletontrap', 1)).toBe(18000);
  expect(skeletonStats('ground')).toEqual({
    hp: 30,
    damage: 17.5,
    dps: 25,
    rate: 0.7,
    speed: 3,
    range: 0.4,
    flying: false,
  });
  expect(skeletonStats('air')).toMatchObject({
    hp: 30,
    damage: 17.5,
    rate: 0.7,
    speed: 2.2,
    range: 0,
    flying: true,
  });
});
it('supports later native levels without granting a TH8 home upgrade past level two', () => {
  expect([1, 2, 3, 4].map(skeletonCount)).toEqual([2, 3, 4, 5]);
  expect([requiredTownHall('skeletontrap', 3), requiredTownHall('skeletontrap', 4)]).toEqual([
    9, 10,
  ]);
  expect([upgradeCost('skeletontrap', 2), upgradeSeconds('skeletontrap', 2)]).toEqual([
    400000, 28800,
  ]);
  expect([upgradeCost('skeletontrap', 3), upgradeSeconds('skeletontrap', 3)]).toEqual([
    1000000, 43200,
  ]);
  const m = new GameModel();
  m.townhall!.level = 8;
  m.state.gold = 10000000;
  const t = makeBuilding(m.state.nextId++, 'skeletontrap', 2, 2, 2);
  m.state.buildings.push(t);
  m.upgrade(t.id);
  expect(t.upgradeEnd).toBeUndefined();
  expect(t.level).toBe(2);
});

for (const mode of ['ground', 'air'] as const)
  it.each([3, 4])(
    `level %i ${mode} trap completes every scheduled spawn once with distinct origins`,
    (level) => {
      const { m, b, trap } = arena(mode, level);
      const trigger = unit(m, mode === 'air' ? 'balloon' : 'giant', 10.5);
      stepTraps(b, 0.05, m.onEffect);
      for (let i = 0; i < level + 1; i++) {
        const at = 0.6 + i * 0.15;
        b.elapsed = at - 0.0001;
        stepTraps(b, 0.0001, m.onEffect);
        expect(b.defenders?.length ?? 0).toBe(i);
        b.elapsed = at;
        stepTraps(b, 0.0001, m.onEffect);
        expect(b.defenders).toHaveLength(i + 1);
        expect(b.defenders![i]).toMatchObject({ sourceId: trap.id, spawnedAt: at, hp: 30, mode });
        if (i === 0) trigger.hp = 0;
      }
      expect(new Set(b.defenders!.map((d) => `${d.x},${d.y}`)).size).toBe(level + 1);
      expect(b.traps[trap.id].resolved).toBe(true);
      stepTraps(b, 3, m.onEffect);
      expect(b.defenders).toHaveLength(level + 1);
    },
  );

it('preserves all twenty Obsidian Tower defenders through native replay and rejects old high-level snapshots', () => {
  const m = obsidianBattle();
  for (let i = 0; i < 80; i++) m.step(0.05);
  m.finishBattle();
  const before = structuredClone(m.battle),
    record = m.state.raidLog![0];
  expect(before!.defenders).toHaveLength(20);
  const sources = before!.buildings.filter((b) => b.kind === 'skeletontrap');
  expect(sources).toHaveLength(5);
  for (const s of sources) {
    expect(s.level).toBe(3);
    expect(before!.defenders!.filter((d) => d.sourceId === s.id)).toHaveLength(4);
  }
  expect(validateReplay(record.replay)).toBe(true);
  const old = structuredClone(record.replay!);
  old.version = 28;
  expect(validateReplay(old)).toBe(false);
  const bad = structuredClone(record.replay!);
  bad.initial.buildings.find((b) => b.kind === 'skeletontrap')!.level = 5;
  expect(validateReplay(bad)).toBe(false);
  m.returnHome();
  const home = structuredClone(m.state);
  expect(m.openReplay(JSON.parse(JSON.stringify(makeReplayFile(record.replay!))).replay)).toBe(
    true,
  );
  const seek = (t: number) => {
    m.seekReplay(t);
    for (let i = 0; i < 100 && m.replay!.seeking; i++) m.step(0.05);
    expect(m.replay!.seeking).toBe(false);
  };
  seek(1e6);
  expect(m.battle).toEqual(before);
  seek(0.85);
  expect(m.battle!.defenders).toHaveLength(10);
  const mid = structuredClone(m.battle);
  seek(0);
  expect(m.battle!.defenders ?? []).toHaveLength(0);
  seek(0.85);
  expect(m.battle).toEqual(mid);
  seek(1e6);
  expect(m.battle).toEqual(before);
  expect(m.state).toEqual(home);
});
describe('activation and sequential spawning', () => {
  it.each(['ground', 'air'] as const)(
    '%s mode triggers only in its circular five-tile range',
    (mode) => {
      const { m, b, trap } = arena(mode);
      const wrong = unit(m, mode === 'ground' ? 'dragon' : 'swordsman', 10.5),
        right = unit(m, mode === 'air' ? 'dragon' : 'swordsman', 15.501);
      stepTraps(b, 0.05, m.onEffect);
      expect(b.traps[trap.id]).toBeUndefined();
      right.x = 15.5;
      right.hp = 0;
      stepTraps(b, 0.05, m.onEffect);
      expect(b.traps[trap.id]).toBeUndefined();
      right.hp = 5000;
      stepTraps(b, 0.05, m.onEffect);
      expect(b.traps[trap.id].targetId).toBe(right.id);
      expect(b.defenders).toBeUndefined();
      expect(wrong.hp).toBe(5000);
    },
  );
  it.each([1, 2])(
    'level %i spawns at .6/.75/.9 seconds once, even after trigger target dies',
    (level) => {
      const { m, b, trap } = arena('ground', level),
        target = unit(m);
      stepTraps(b, 0.05, m.onEffect);
      target.hp = 0;
      b.elapsed = 0.599;
      stepTraps(b, 0.05, m.onEffect);
      expect(b.defenders).toBeUndefined();
      b.elapsed = 0.6;
      stepTraps(b, 0.05, m.onEffect);
      expect(b.defenders).toHaveLength(1);
      b.elapsed = 0.75;
      stepTraps(b, 0.05, m.onEffect);
      expect(b.defenders).toHaveLength(2);
      b.elapsed = 1.5;
      stepTraps(b, 0.75, m.onEffect);
      stepTraps(b, 0.05, m.onEffect);
      expect(b.defenders).toHaveLength(level === 1 ? 2 : 3);
      expect(b.traps[trap.id].resolved).toBe(true);
      b.defenders!.forEach((d, i) => expect(d.spawnedAt).toBeCloseTo([0.6, 0.75, 0.9][i], 10));
      expect(new Set(b.defenders!.map((d) => d.id)).size).toBe(level === 1 ? 2 : 3);
    },
  );
  it('processes a whole spawn sequence across a wide frame with original timestamps', () => {
    const { m, b } = arena('air');
    unit(m, 'balloon');
    stepTraps(b, 0.05, m.onEffect);
    b.elapsed = 2;
    stepTraps(b, 2, m.onEffect);
    expect(b.defenders).toHaveLength(3);
    b.defenders!.forEach((d, i) => {
      expect(d).toMatchObject({ mode: 'air', maxHp: 30 });
      expect(d.spawnedAt).toBeCloseTo([0.6, 0.75, 0.9][i], 10);
    });
  });
  it('never activates while upgrading, remains passable and cannot be destroyed by Lightning', () => {
    const { m, b, trap } = arena();
    unit(m);
    trap.upgradeEnd = 10000;
    stepTraps(b, 0.1, m.onEffect);
    expect(b.traps[trap.id]).toBeUndefined();
    expect(m.deployBlocked(10.5, 10.5)).toBe(false);
    m.damage(trap, 99999);
    expect(trap.hp).toBe(trap.maxHp);
    m.activeSpell = 'lightning';
    b.spells.lightning = 1;
    m.castSpell(10.5, 10.5);
    expect(b.traps[trap.id]).toBeUndefined();
    expect(trap.hp).toBe(trap.maxHp);
  });
});
describe('defending Skeleton combat', () => {
  it('finishes an exhausted attack even when defenders remain alive', () => {
    const { m, b, trap } = arena();
    const d = spawnSkeleton(b, trap, -1, 0);
    b.remaining = Object.fromEntries(TROOP_KEYS.map((k) => [k, 0])) as typeof b.remaining;
    m.step(0.05);
    expect(b.finished).toBe(true);
    expect(d.hp).toBe(30);
    expect(b.destruction).toBe(0);
    expect(m.visibleBuilding(trap)).toBe(false);
  });
  it('does not spawn the rest of a triggered trap after the attack ends', () => {
    const { m, b, trap } = arena();
    unit(m, 'giant');
    stepTraps(b, 0.05, m.onEffect);
    expect(b.traps[trap.id].resolved).toBe(false);
    m.finishBattle();
    m.step(5);
    expect(b.defenders).toBeUndefined();
    expect(m.visibleBuilding(trap)).toBe(false);
  });
  it.each(['ground', 'air'] as const)(
    '%s skeleton waits its spawn idle, then attacks only its own layer',
    (mode) => {
      const { m, b, trap } = arena(mode),
        d = spawnSkeleton(b, trap, 0, 0),
        target = unit(m, mode === 'ground' ? 'giant' : 'balloon', d.x, d.y),
        wrong = unit(m, mode === 'ground' ? 'dragon' : 'pekka', d.x, d.y);
      b.elapsed = 0.499;
      stepDefenders(b, 0.499, m.onEffect);
      expect(target.hp).toBe(5000);
      b.elapsed = 0.55;
      stepDefenders(b, 0.051, m.onEffect);
      expect(target.hp).toBe(4982.5);
      expect(wrong.hp).toBe(5000);
      b.elapsed = 1.2;
      stepDefenders(b, 0.65, m.onEffect);
      expect(target.hp).toBe(4982.5);
      b.elapsed = 1.25;
      stepDefenders(b, 0.05, m.onEffect);
      expect(target.hp).toBe(4965);
      target.hp = 0;
      b.elapsed = 2;
      stepDefenders(b, 0.75, m.onEffect);
      expect(d.target).toBeNull();
      expect(wrong.hp).toBe(5000);
    },
  );
  it('ground defenders cross their own walls without damaging them', () => {
    const { m, b, trap } = arena(),
      d = spawnSkeleton(b, trap, -1, 0),
      target = unit(m, 'giant', 13.5),
      wall = makeBuilding(9010, 'wall', 11, 10, 4);
    b.buildings.push(wall);
    for (let i = 0; i < 25; i++) {
      b.elapsed += 0.1;
      stepDefenders(b, 0.1, m.onEffect);
    }
    expect(d.x).toBeGreaterThan(12);
    expect(target.hp).toBeLessThan(5000);
    expect(wall.hp).toBe(wall.maxHp);
  });
  it('retains its attack cadence across uneven simulation frames', () => {
    const { m, b, trap } = arena(),
      d = spawnSkeleton(b, trap, -1, 0);
    const u = unit(m, 'giant', d.x, d.y);
    for (let i = 0; i < 100; i++) {
      b.elapsed += 0.06;
      stepDefenders(b, 0.06, m.onEffect);
    }
    expect(5000 - u.hp).toBe(9 * 17.5);
  });
  it('approaches a moving target near the corner of a grid cell', () => {
    const point = { x: 10.05, y: 10.05 };
    const path = findPath({ x: 13.5, y: 10.5 }, point, [], 0.4);
    expect(path.length).toBeGreaterThan(0);
    expect(Math.hypot(path.at(-1)!.x - point.x, path.at(-1)!.y - point.y)).toBeLessThanOrEqual(0.4);
  });
  it('a defense-preferring troop finishes its current building before accepting an alert', () => {
    const { m, b, trap } = arena(),
      d = spawnSkeleton(b, trap, -1, 0);
    const u = unit(m, 'giant', d.x, d.y);
    d.alerted = true;
    u.target = 9001;
    m.step(0.05);
    expect(u.defenderTarget).toBeUndefined();
    expect(u.target).toBe(9001);
    m.damage(b.buildings[1], 99999);
    m.step(0.05);
    expect(u.defenderTarget).toBe(d.id);
  });
  it('a same-cell point target gets a real approach segment', () => {
    const path = findPath({ x: 10.05, y: 10.05 }, { x: 10.6, y: 10.6 }, [], 0.4);
    expect(path.length).toBeGreaterThan(0);
    expect(Math.hypot(path.at(-1)!.x - 10.6, path.at(-1)!.y - 10.6)).toBeLessThanOrEqual(0.4);
  });
  it('P.E.K.K.A retaliates against ground skeletons and resumes buildings after killing them', () => {
    const { m, b, trap } = arena(),
      d = spawnSkeleton(b, trap, -1, 0),
      u = unit(m, 'pekka', d.x, d.y);
    u.cooldown = 0;
    m.step(0.05);
    expect(u.defenderTarget).toBe(d.id);
    expect(d.hp).toBe(0);
    expect(u.hp).toBe(4982.5);
    m.step(0.05);
    expect(u.defenderTarget).toBeUndefined();
    expect(u.target).toBe(9001);
  });
  it.each(['giant', 'balloon', 'goblin'] as const)(
    '%s retains preferred buildings while skeletons attack',
    (kind) => {
      const { m, b, trap } = arena(),
        u = unit(m, kind, 10.68);
      trap.skeletonMode = kind === 'balloon' ? 'air' : 'ground';
      const d = spawnSkeleton(b, trap, -1, 0);
      b.buildings.push(makeBuilding(9010, kind === 'goblin' ? 'goldstorage' : 'cannon', 14, 10));
      m.step(0.05);
      expect(u.hp).toBeLessThan(5000);
      expect(u.defenderTarget).toBeUndefined();
      expect(u.target).toBe(9010);
      expect(d.hp).toBe(30);
    },
  );
  it('ground-only attackers cannot retaliate against air skeletons, while Archers can', () => {
    const { m, b, trap } = arena('air'),
      d = spawnSkeleton(b, trap, -1, 0),
      ground = unit(m, 'pekka', d.x, d.y),
      archer = unit(m, 'archer', d.x, d.y);
    d.alerted = true;
    d.stunnedUntil = 100;
    ground.cooldown = archer.cooldown = 0;
    m.step(0.05);
    expect(ground.defenderTarget).toBeUndefined();
    expect(archer.defenderTarget).toBe(d.id);
    expect(b.projectiles?.some((p) => p.targetDefender && p.toAir)).toBe(true);
  });
  it('an alerted defender attracts nearby support troops but not troops beyond seven tiles', () => {
    const { m, b, trap } = arena(),
      d = spawnSkeleton(b, trap, -1, 0),
      near = unit(m, 'archer', 16.68),
      far = unit(m, 'archer', 17.681);
    d.alerted = true;
    d.stunnedUntil = 100;
    m.step(0.05);
    expect(near.defenderTarget).toBe(d.id);
    expect(far.defenderTarget).toBeUndefined();
  });
});
describe('damage allegiance and moving targets', () => {
  it('Wizard fireballs travel at five tiles/s and miss a defender who leaves the launch point', () => {
    const { m, b, trap } = arena(),
      d = spawnSkeleton(b, trap, -1, 0);
    d.alerted = true;
    d.stunnedUntil = 100;
    const u = unit(m, 'wizard', d.x - 3, d.y);
    u.cooldown = 0;
    m.step(0.05);
    const shot = b.projectiles![0];
    expect(shot.targetDefender).toBe(true);
    expect(shot.impact - shot.launched).toBeCloseTo(0.6);
    const aim = { x: shot.x, y: shot.y };
    d.y += 1;
    b.elapsed = shot.impact;
    stepProjectiles(b, (t, p, at) => m.damage(t, p, at), m.onEffect);
    expect([shot.x, shot.y]).toEqual([aim.x, aim.y]);
    expect(d.hp).toBe(30);
  });
  it('Archer arrows track a moving defender without ever damaging the attacking army', () => {
    const { m, b, trap } = arena(),
      d = spawnSkeleton(b, trap, -1, 0),
      u = unit(m, 'archer');
    const shot = launchProjectile(
      b,
      {
        weapon: 'arrow',
        sourceId: u.id,
        targetId: d.id,
        targetBuilding: false,
        targetDefender: true,
        fromX: u.x,
        fromY: u.y,
        x: d.x,
        y: d.y,
        damage: 10,
      },
      m.onEffect,
    );
    d.x += 1;
    b.elapsed = shot.impact;
    stepProjectiles(b, (t, p, at) => m.damage(t, p, at), m.onEffect);
    expect(d.hp).toBe(20);
    expect(shot.x).toBe(d.x);
    expect(u.hp).toBe(5000);
  });
  it('ground splash reaches defenders and buildings; air splash stays on the selected layer', () => {
    const { m, b, trap } = arena(),
      ground = spawnSkeleton(b, trap, -1, 0);
    trap.skeletonMode = 'air';
    const air = spawnSkeleton(b, trap, -1, 0);
    const building = makeBuilding(9010, 'cannon', 11, 10);
    b.buildings.push(building);
    const shot = launchProjectile(
      b,
      {
        weapon: 'fireball',
        sourceId: 10000,
        targetId: ground.id,
        targetBuilding: false,
        targetDefender: true,
        fromX: 7,
        fromY: 10.5,
        x: ground.x,
        y: ground.y,
        damage: 10,
        splash: 0.4,
      },
      m.onEffect,
    );
    b.elapsed = shot.impact;
    stepProjectiles(b, (t, p, at) => m.damage(t, p, at), m.onEffect);
    expect(ground.hp).toBe(20);
    expect(air.hp).toBe(30);
    expect(building.maxHp - building.hp).toBe(10);
    damageDefenders(b, air, 10, 0.4, 'air');
    expect(ground.hp).toBe(20);
    expect(air.hp).toBe(20);
  });
  it('Lightning hits both defending layers; Healing and Rage only affect the attacking army', () => {
    const { m, b, trap } = arena(),
      ground = spawnSkeleton(b, trap, -1, 0);
    trap.skeletonMode = 'air';
    const air = spawnSkeleton(b, trap, -1, 0);
    ground.hp = air.hp = 10;
    startSpellAura(b, 'heal', ground.x, ground.y);
    startSpellAura(b, 'rage', ground.x, ground.y);
    expect(ground.hp).toBe(10);
    expect(air.hp).toBe(10);
    m.activeSpell = 'lightning';
    b.spells.lightning = 1;
    m.castSpell(ground.x, ground.y);
    expect(ground.hp).toBe(0);
    expect(air.hp).toBe(0);
    expect(ground.defeatedAt).toBe(0);
  });
  it('Dragon breath can destroy a group of defending skeletons', () => {
    const { m, b, trap } = arena(),
      first = spawnSkeleton(b, trap, -1, 0),
      second = spawnSkeleton(b, trap, -1, 1);
    second.x = first.x + 0.1;
    second.y = first.y;
    first.alerted = true;
    const u = unit(m, 'dragon', first.x - 2, first.y);
    u.cooldown = 0;
    stepAttackerVsDefenders(
      b,
      u,
      { damage: 40, range: 2.5, speed: 2.5, rate: 1.25 },
      0.05,
      b.buildings,
      (t, p) => m.damage(t, p),
      m.onEffect,
    );
    expect(first.hp).toBe(0);
    expect(second.hp).toBe(0);
  });
});
it('mode changes survive undo, saved layouts and reload validation, and cannot occur during attacks', () => {
  const m = new GameModel();
  m.state.obstacles = [];
  m.state.buildings = [
    makeBuilding(1, 'townhall', 20, 20, 8),
    makeBuilding(2, 'skeletontrap', 8, 8),
    makeBuilding(3, 'builder', 25, 25),
  ];
  m.state.nextId = 4;
  m.selected = 2;
  m.editing = true;
  expect(m.toggleSkeletonMode()).toBe(true);
  expect(m.state.buildings[1].skeletonMode).toBe('air');
  m.saveLayout(0);
  m.undo();
  expect(m.state.buildings[1].skeletonMode).toBe('ground');
  m.redo();
  expect(m.state.buildings[1].skeletonMode).toBe('air');
  m.toggleSkeletonMode();
  m.loadLayout(0);
  expect(m.state.buildings[1].skeletonMode).toBe('air');
  expect(validateSave(m.state)).toBe(true);
  const bad = JSON.parse(JSON.stringify(m.state));
  bad.buildings[1].skeletonMode = 'both';
  expect(validateSave(bad)).toBe(false);
  bad.buildings[1].skeletonMode = 'air';
  bad.layouts[0].slots[1].skeletonMode = 1;
  expect(validateSave(bad)).toBe(false);
  m.startBattle(0, true);
  expect(m.toggleSkeletonMode()).toBe(false);
  expect(m.battle!.buildings[1].skeletonMode).toBe('air');
});
it('replay import and seeking reconstruct defender combat and re-arm both traps on a fresh practice', () => {
  const m = new GameModel();
  m.state.obstacles = [];
  const ground = makeBuilding(2, 'skeletontrap', 6, 10, 2),
    air = makeBuilding(3, 'skeletontrap', 7, 10, 2);
  air.skeletonMode = 'air';
  m.state.buildings = [makeBuilding(1, 'townhall', 30, 30, 8), ground, air];
  m.state.nextId = 4;
  m.state.army = Object.fromEntries(
    TROOP_KEYS.map((k) => [
      k,
      k === 'dragon' ? 3 : k === 'pekka' ? 2 : k === 'giant' ? 2 : k === 'archer' ? 8 : 0,
    ]),
  ) as typeof m.state.army;
  m.startBattle(0, true);
  for (const kind of ['giant', 'pekka', 'dragon', 'archer'] as const) {
    m.activeTroop = kind;
    while (m.battle!.remaining[kind]) m.deploy(1, 11);
  }
  for (let i = 0; i < 500; i++) m.step(0.05);
  m.finishBattle();
  const before = JSON.parse(JSON.stringify(m.battle));
  expect(before.defenders).toHaveLength(6);
  const record = m.state.raidLog![0];
  record.replay = JSON.parse(JSON.stringify(makeReplayFile(record.replay!))).replay;
  expect(record.replay!.version).toBe(REPLAY_VERSION);
  expect(validateReplay(record.replay)).toBe(true);
  m.returnHome();
  m.startReplay(record.id);
  for (let i = 0; i < 1000 && !m.replay!.complete; i++) m.step(0.1);
  const after = JSON.parse(JSON.stringify(m.battle));
  for (const key of ['buildings', 'units', 'defenders', 'traps', 'result'])
    expect(after[key]).toEqual(before[key]);
  m.seekReplay(0);
  for (let i = 0; i < 100 && m.replay!.seeking; i++) m.step(0.05);
  expect(m.battle!.defenders).toBeUndefined();
  expect(m.battle!.traps).toEqual({});
  m.returnHome();
  m.startBattle(0, true);
  expect(m.battle!.defenders).toBeUndefined();
  expect(m.battle!.buildings[2].skeletonMode).toBe('air');
});
