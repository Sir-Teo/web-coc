import { describe, expect, it } from 'vitest';
import { BUILDINGS, TROOPS, trapDamage, type TroopKind } from '../src/game/data';
import {
  GameModel,
  makeBuilding,
  findPath,
  type Building,
  type Unit,
  type FX,
} from '../src/game/model';
import { stepTraps, springOutcome } from '../src/game/traps';
import { validateSave, migrateSave } from '../src/game/save';

function arena(buildings: Building[]) {
  const m = new GameModel();
  m.startBattle(0, true);
  m.battle!.buildings = [...buildings, makeBuilding(999, 'townhall', 22, 22)];
  m.battle!.started = true;
  return m;
}
function unit(m: GameModel, kind: TroopKind, x = 10.5, y = 10.5) {
  const d = m.troopStats(kind);
  const u: Unit = {
    id: m.state.nextId++,
    kind,
    x,
    y,
    hp: d.hp,
    maxHp: d.hp,
    cooldown: 999,
    target: null,
    path: [],
    pathAt: 0,
    attacking: false,
  };
  m.battle!.units.push(u);
  return u;
}
function traps(m: GameModel, seconds: number, effects: FX[] = []) {
  for (let i = 0; i < Math.round(seconds / 0.05); i++) {
    m.battle!.elapsed += 0.05;
    stepTraps(m.battle!, 0.05, (fx) => effects.push(fx));
  }
}

describe('hidden traps', () => {
  it('obeys unlocks, building limits, collision, builders, upgrades and save round trips', () => {
    const m = new GameModel();
    m.state.obstacles = []; // Cleared ground for this placement scenario.
    m.beginBuild('springtrap');
    expect(m.placement).toBeNull();
    m.beginBuild('bomb');
    expect(m.placement).toBeNull();
    m.townhall!.level = 3;
    m.beginBuild('bomb');
    expect(m.place(2, 2)).toBe(true);
    const bomb = m.state.buildings.at(-1)!;
    expect(m.canPlace('bomb', 2, 2)).toBe(false);
    expect(m.busy).toBe(0);
    expect(bomb.upgradeEnd).toBeUndefined();
    m.upgrade(bomb.id);
    expect(m.busy).toBe(1);
    m.tick(bomb.upgradeEnd! + 1);
    expect(bomb.level).toBe(2);
    expect(trapDamage('bomb', bomb.level)).toBeGreaterThan(trapDamage('bomb', 1));
    m.beginBuild('bomb');
    m.place(3, 2);
    m.beginBuild('bomb');
    expect(m.placement).toBeNull();
    const restored = migrateSave(JSON.parse(JSON.stringify(m.state)));
    expect(validateSave(restored)).toBe(true);
    (restored as typeof m.state).buildings.find((b) => b.id === bomb.id)!.level = 99;
    expect(validateSave(restored)).toBe(false);
  });

  it('conceals traps and excludes them from deployment boundaries, pathfinding and targeting', () => {
    const bomb = makeBuilding(1000, 'bomb', 10, 10);
    const m = arena([bomb]);
    expect(m.visibleBuilding(bomb)).toBe(false);
    expect(m.deployBlocked(10.5, 10.5)).toBe(false);
    const target = m.battle!.buildings.at(-1)!;
    expect(findPath({ x: 9, y: 10 }, target, m.battle!.buildings, 1)).toEqual(
      findPath({ x: 9, y: 10 }, target, [target], 1),
    );
    const u = unit(m, 'giant');
    m.step(0.05);
    expect(u.target).toBe(target.id);
    expect(m.visibleBuilding(bomb)).toBe(true);
  });

  it.each(['bomb', 'giantbomb'] as const)(
    '%s fuses once, damages only nearby ground troops, and permits escape',
    (kind) => {
      const bomb = makeBuilding(1000, kind, 10, 10, 2);
      const m = arena([bomb]);
      const runner = unit(m, 'goblin');
      const ground = unit(m, 'giant', 12, 10.5);
      const air = unit(m, 'balloon');
      const fx: FX[] = [];
      traps(m, 0.05, fx);
      expect(ground.hp).toBe(ground.maxHp);
      runner.x = 20;
      traps(m, 2, fx);
      expect(ground.hp).toBe(ground.maxHp - trapDamage(kind, 2));
      expect(runner.hp).toBe(runner.maxHp);
      expect(air.hp).toBe(air.maxHp);
      expect(fx.filter((f) => f.type === 'blast')).toHaveLength(1);
      traps(m, 4, fx);
      expect(fx.filter((f) => f.type === 'blast')).toHaveLength(1);
    },
  );

  it('air bombs ignore ground troops and follow a moving air target', () => {
    const m = arena([makeBuilding(1000, 'airbomb', 10, 10)]);
    const ground = unit(m, 'giant');
    traps(m, 1);
    expect(m.battle!.traps).toEqual({});
    const air = unit(m, 'balloon');
    traps(m, 0.05);
    air.x = 15;
    const neighbor = unit(m, 'balloon', 15, 11);
    traps(m, 1.5);
    expect(air.hp).toBe(air.maxHp - trapDamage('airbomb', 1));
    expect(neighbor.hp).toBe(neighbor.maxHp - trapDamage('airbomb', 1));
    expect(ground.hp).toBe(ground.maxHp);
  });

  it('springs only the largest ground troop and suppresses ejected death bombs', () => {
    const m = arena([makeBuilding(1000, 'springtrap', 10, 10)]);
    const small = unit(m, 'archer');
    const giant = unit(m, 'giant');
    const air = unit(m, 'balloon');
    traps(m, 0.05);
    expect(giant.ejected).toBe(true);
    expect(giant.hp).toBe(0);
    expect(small.hp).toBe(small.maxHp);
    expect(air.hp).toBe(air.maxHp);
    const spring = makeBuilding(1001, 'springtrap', 15, 15);
    m.battle!.buildings.push(spring);
    const breaker = unit(m, 'wallbreaker', 15.5, 15.5);
    traps(m, 0.05);
    expect(breaker.spent).toBe(true);
    const fx: FX[] = [];
    m.onEffect = (e) => fx.push(e);
    m.step(0.05);
    expect(fx.some((e) => e.type === 'blast')).toBe(false);
  });

  it('damages oversized survivors, prevents spring stacking, and does not confer bomb immunity', () => {
    expect(springOutcome(20, 600, 10, 500)).toEqual({ ejected: false, hp: 100 });
    expect(springOutcome(20, 500, 10, 500)).toEqual({ ejected: true, hp: 0 });
    const m = arena([makeBuilding(1000, 'bomb', 10, 10), makeBuilding(1001, 'springtrap', 10, 11)]);
    const u = unit(m, 'giant', 10.5, 11.1);
    u.springUntil = 100;
    traps(m, 2);
    expect(m.battle!.traps[1001]).toBeUndefined();
    expect(u.hp).toBe(u.maxHp - trapDamage('bomb', 1));
  });

  it('upgrading traps stay inactive; each practice starts armed and preserves the home state', () => {
    const m = new GameModel();
    m.state.obstacles = []; // Cleared ground for this placement scenario.
    const bomb = makeBuilding(m.state.nextId++, 'bomb', 2, 2);
    const inactive = makeBuilding(m.state.nextId++, 'giantbomb', 23, 2);
    inactive.upgradeEnd = m.clock + 100000;
    m.state.buildings.push(bomb, inactive);
    const before = JSON.stringify(m.state.buildings);
    const gold = m.state.gold;
    m.startBattle(0, true);
    unit(m, 'giant', 2.5, 2.5);
    unit(m, 'giant', 24, 3);
    traps(m, 2);
    expect(m.battle!.traps[bomb.id].resolved).toBe(true);
    expect(m.battle!.traps[inactive.id]).toBeUndefined();
    m.finishBattle();
    m.returnHome();
    m.startBattle(0, true);
    expect(m.battle!.traps).toEqual({});
    expect(JSON.stringify(m.state.buildings)).toBe(before);
    expect(m.state.gold).toBe(gold);
    expect(validateSave(m.state)).toBe(true);
  });

  it('tosses an oversized survivor in place without crossing walls or taking two spring hits', () => {
    // The shipping roster has no troop over ten spaces yet. Exercise the future
    // heavy-unit path using a tank with larger housing, restoring the catalog.
    const space = TROOPS.giant.space;
    try {
      TROOPS.giant.space = 20;
      const m = arena([
        makeBuilding(1000, 'springtrap', 10, 10, 2),
        makeBuilding(1001, 'springtrap', 11, 10, 2),
        makeBuilding(1002, 'wall', 12, 10),
      ]);
      const tank = unit(m, 'giant', 11, 10.5);
      tank.path = [{ x: 15, y: 15 }];
      traps(m, 0.05);
      expect(tank.hp).toBe(tank.maxHp - 250);
      expect(tank.ejected).toBe(false);
      expect([tank.x, tank.y]).toEqual([11, 10.5]);
      expect(tank.path).toEqual([]);
      expect(m.battle!.traps[1001]).toBeUndefined();
    } finally {
      TROOPS.giant.space = space;
    }
  });

  it('lightning cannot destroy traps, and traps cannot withhold a three-star clear', () => {
    const bomb = makeBuilding(1000, 'bomb', 10, 10);
    const m = arena([bomb]);
    m.battle!.spells.lightning = 1;
    m.activeSpell = 'lightning';
    m.castSpell(10.5, 10.5);
    expect(bomb.hp).toBe(bomb.maxHp);
    const hall = m.battle!.buildings.at(-1)!;
    m.damage(hall, hall.hp);
    m.step(0.05);
    expect(m.battle!.result).toMatchObject({ destruction: 100, stars: 3 });
  });
});

describe('Wizard Tower', () => {
  it.each(['giant', 'balloon'] as const)(
    'splashes the %s layer and leaves the other layer alone',
    (kind) => {
      const tower = makeBuilding(1000, 'wizardtower', 10, 10);
      const m = arena([tower]);
      const target = unit(m, kind, 15, 11);
      const neighbor = unit(m, kind, 15.8, 11);
      const other = unit(m, kind === 'giant' ? 'balloon' : 'giant', 16, 11);
      m.step(0.05);
      expect(target.hp).toBe(target.maxHp);
      for (let i = 0; i < 6; i++) m.step(0.05);
      expect(target.hp).toBe(target.maxHp - BUILDINGS.wizardtower.damage!);
      expect(neighbor.hp).toBe(neighbor.maxHp - BUILDINGS.wizardtower.damage!);
      expect(other.hp).toBe(other.maxHp);
    },
  );
  it('does not fire during an upgrade or outside range', () => {
    const tower = makeBuilding(1000, 'wizardtower', 10, 10);
    tower.upgradeEnd = Date.now() + 10000;
    const m = arena([tower]);
    const target = unit(m, 'giant', 15, 11);
    m.step(0.05);
    expect(target.hp).toBe(target.maxHp);
    delete tower.upgradeEnd;
    target.x = 25;
    m.step(0.05);
    expect(target.hp).toBe(target.maxHp);
  });
});
