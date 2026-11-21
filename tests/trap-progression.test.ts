import { describe, expect, it } from 'vitest';
import { emptyArmy, emptySpells } from '../src/game/army';
import { nativeBuildings } from '../src/game/native-campaign';
import { nativeTrapValues } from '../src/game/native-traps';
import { fundedVillage } from './fixtures/funded-village';
import {
  BUILDINGS,
  maxCountFor,
  maxLevelFor,
  trapDamage,
  trapStats,
  upgradeCost,
  upgradeSeconds,
  type TroopKind,
} from '../src/game/data';
import { GameModel, makeBuilding, type Unit } from '../src/game/model';
import { airBombProjectileName, nativeProjectilePack } from '../src/game/native-projectile-poses';
import { initialNativeState } from '../src/game/native-troops';
import { validateSave } from '../src/game/save';
import { REPLAY_VERSION, compatibleReplayVersion, replayBattle } from '../src/game/replay';
import { stepTraps } from '../src/game/traps';

it('resolves every Air Bomb level to the pinned flight variant', () => {
  const variants = [1, 1, 3, 3, 5, 5, 6, 6, 8, 8, 11, 11, 13];
  for (const [index, variant] of variants.entries()) {
    const name = airBombProjectileName(index + 1);
    const suffix = variant === 1 ? '' : `_lvl${variant}`;
    const pack = variant === 1 ? 'airtrapballoon' : `airtrapballoon-lvl${variant}`;
    expect(name).toBe(`AirTrapBalloon${suffix}`);
    expect(nativeProjectilePack(name)).toBe(`assets/projectiles-native/${pack}/graph.json`);
  }
});

const expected = {
  bomb: {
    costs: [400, 1000, 10000, 40000, 100000, 230000, 330000, 500000],
    seconds: [0, 60, 300, 1800, 3600, 7200, 10800, 14400],
    damage: [20, 24, 29, 35, 42, 54, 72, 92],
    counts: [0, 0, 2, 2, 4, 4, 6, 6],
    cap: 5,
    unlock: 3,
  },
  giantbomb: {
    costs: [12500, 75000, 220000, 750000, 900000],
    seconds: [0, 3600, 10800, 14400, 36000],
    damage: [175, 200, 225, 250, 275],
    counts: [0, 0, 0, 0, 0, 1, 2, 3],
    cap: 3,
    unlock: 6,
  },
  airbomb: {
    costs: [4000, 20000, 75000, 300000, 550000, 800000],
    seconds: [0, 1800, 3600, 14400, 28800, 43200],
    damage: [100, 120, 144, 173, 208, 232],
    counts: [0, 0, 0, 0, 2, 2, 2, 4],
    cap: 3,
    unlock: 5,
  },
  springtrap: {
    costs: [2000, 130000, 240000, 350000, 800000],
    seconds: [0, 3600, 7200, 10800, 14400],
    damage: [0, 250, 300, 350, 400],
    counts: [0, 0, 0, 2, 2, 4, 4, 6],
    cap: 3,
    unlock: 4,
  },
} as const;
const kinds = ['bomb', 'giantbomb', 'airbomb', 'springtrap'] as const;

for (const kind of kinds)
  describe(`${kind} progression`, () => {
    const e = expected[kind];
    it('places instantly with every builder occupied but requires a builder for upgrades', () => {
      const m = new GameModel();
      m.townhall!.level = 8;
      m.state.obstacles = [];
      const busy = m.state.buildings.filter((b) => b.kind === 'cannon');
      for (const b of busy) {
        b.upgradeStart = m.clock;
        b.upgradeEnd = m.clock + 10000000;
      }
      expect(m.busy).toBe(m.builders);
      m.state.gold = e.costs[0] - 1;
      m.beginBuild(kind);
      expect(m.placement).toBeNull();
      m.state.gold++;
      m.beginBuild(kind);
      expect(m.place(2, 2)).toBe(true);
      const trap = m.state.buildings.at(-1)!;
      expect([m.state.gold, trap.level, trap.constructing, trap.upgradeEnd]).toEqual([
        0,
        1,
        undefined,
        undefined,
      ]);
      expect(m.busy).toBe(m.builders);
      m.state.gold = e.costs[1];
      m.upgrade(trap.id);
      expect(trap.upgradeEnd).toBeUndefined();
      expect(m.state.gold).toBe(e.costs[1]);
      expect(validateSave(m.state)).toBe(true);
      const restored = new GameModel(structuredClone(m.state));
      expect(restored.state.buildings.find((b) => b.id === trap.id)).toMatchObject({
        level: 1,
        x: 2,
        y: 2,
      });
    });
    it('charges each playable destination, retains paid timestamps after reload and completes exactly once', () => {
      let m = new GameModel();
      m.townhall!.level = 8;
      m.state.obstacles = [];
      const id = m.state.nextId++;
      m.state.buildings.push(makeBuilding(id, kind, 2, 2));
      for (let level = 1; level < e.cap; level++) {
        let b = m.state.buildings.find((b) => b.id === id)!;
        m.state.gold = e.costs[level] - 1;
        m.upgrade(id);
        expect(b.upgradeEnd).toBeUndefined();
        m.state.gold++;
        m.upgrade(id);
        const end = m.clock + e.seconds[level] * 1000;
        expect(b.upgradeEnd).toBe(end);
        expect(m.state.gold).toBe(0);
        expect(m.busy).toBe(1);
        m = new GameModel(structuredClone(m.state));
        b = m.state.buildings.find((b) => b.id === id)!;
        expect(b.upgradeEnd).toBe(end);
        expect(m.busy).toBe(1);
        m.tick(end - 1);
        expect(b.level).toBe(level);
        m.tick(end);
        expect(b.level).toBe(level + 1);
        expect(m.busy).toBe(0);
        m.tick(end + 1);
        expect(b.level).toBe(level + 1);
      }
      m.state.gold = 10000000;
      m.upgrade(id);
      expect(m.state.buildings.find((b) => b.id === id)!.upgradeEnd).toBeUndefined();
      expect(m.state.gold).toBe(10000000);
    });
    it('enforces Town Hall gates and counts, while retaining old above-cap traps and paid construction', () => {
      expect(Array.from({ length: 8 }, (_, i) => maxCountFor(kind, i + 1))).toEqual(e.counts);
      expect(maxLevelFor(kind, 8)).toBe(e.cap);
      const m = fundedVillage();
      m.state.obstacles = [];
      m.townhall!.level = e.unlock - 1;
      m.beginBuild(kind);
      expect(m.placement).toBeNull();
      m.placement = kind;
      expect(m.place(2, 2)).toBe(false);
      m.townhall!.level = e.unlock;
      m.beginBuild(kind);
      expect(m.place(2, 2)).toBe(true);
      const old = makeBuilding(m.state.nextId++, kind, 22, 2, BUILDINGS[kind].maxLevel);
      old.constructing = true;
      old.upgradeStart = m.clock;
      old.upgradeEnd = m.clock + 100000;
      m.state.buildings.push(old);
      const restored = new GameModel(structuredClone(m.state));
      const saved = restored.state.buildings.find((b) => b.id === old.id)!;
      expect(saved).toMatchObject({
        level: old.level,
        constructing: true,
        upgradeEnd: old.upgradeEnd,
      });
      restored.tick(old.upgradeEnd!);
      expect(saved.level).toBe(old.level);
      expect(saved.constructing).toBe(false);
      expect(validateSave(restored.state)).toBe(true);
    });
    it('uses the complete accepted table instead of a scaling formula', () => {
      expect(BUILDINGS[kind].cost).toBe(e.costs[0]);
      expect(BUILDINGS[kind].build).toBe(0);
      e.damage.forEach((value, i) => {
        expect(trapDamage(kind, i + 1)).toBe(value);
        if (i) {
          expect(upgradeCost(kind, i)).toBe(e.costs[i]);
          expect(upgradeSeconds(kind, i)).toBe(e.seconds[i]);
        }
      });
    });
  });

function arena(kind: (typeof kinds)[number], level: number, troop: TroopKind = 'giant') {
  const m = new GameModel();
  m.startBattle(0, true);
  const b = m.battle!;
  const trap = makeBuilding(9000, kind, 10, 10, level);
  b.buildings = [trap, makeBuilding(9001, 'townhall', 22, 22)];
  b.started = true;
  const center = 10 + BUILDINGS[kind].size / 2;
  const u: Unit = {
    id: 9002,
    kind: troop,
    x: center,
    y: center,
    hp: 10000,
    maxHp: 10000,
    cooldown: 1000,
    target: null,
    path: [],
    pathAt: 0,
    attacking: false,
  };
  b.units = [u];
  return { m, b, u, trap, center };
}
for (const kind of ['bomb', 'giantbomb', 'airbomb'] as const)
  it(`${kind} applies each accepted damage tier once at its blast boundary`, () => {
    for (let level = 1; level <= expected[kind].damage.length; level++) {
      const { b, u, center } = arena(kind, level, kind === 'airbomb' ? 'balloon' : 'giant');
      const d = trapStats(kind, level)!;
      const edge = { ...u, id: 9003, x: center + d.radius, path: [] },
        outside = { ...u, id: 9004, x: center + d.radius + 0.001, path: [] };
      b.units.push(edge, outside);
      b.elapsed = 0.05;
      stepTraps(b, 0.05, () => {});
      expect(u.hp).toBe(u.maxHp);
      b.elapsed += d.delay - 0.001;
      stepTraps(b, 0.001, () => {});
      expect(u.hp).toBe(u.maxHp);
      b.elapsed += 0.001;
      stepTraps(b, 0.001, () => {});
      expect(u.hp).toBe(u.maxHp - expected[kind].damage[level - 1]);
      expect(edge.hp).toBe(edge.maxHp - expected[kind].damage[level - 1]);
      expect(outside.hp).toBe(outside.maxHp);
      stepTraps(b, 0.05, () => {});
      expect(u.hp).toBe(u.maxHp - expected[kind].damage[level - 1]);
    }
  });
it.each([239, 240, REPLAY_VERSION])(
  'Air Bomb impact follows replay %i targeting rules',
  (version) => {
    const { b: template, u, trap, center } = arena('airbomb', 1, 'balloon');
    expect(compatibleReplayVersion(version)).toBe(true);
    const b = replayBattle(
      {
        index: 0,
        practice: true,
        buildings: [trap],
        army: emptyArmy(),
        spells: emptySpells(),
        troopLevels: template.troopLevels,
        nextId: 9004,
      },
      version,
    );
    const aim = { x: center + 0.5, y: center + 0.5 };
    Object.assign(u, aim);
    const bystander = { ...u, id: 9003, x: aim.x + 3, path: [] };
    b.started = true;
    b.units = [u, bystander];
    b.elapsed = 0.05;
    stepTraps(b, 0.05, () => {});
    u.x = aim.x + 4;
    b.elapsed += trapStats('airbomb', 1)!.delay;
    stepTraps(b, 0.05, () => {});
    const fixed = version >= 240;
    expect(b.traps[trap.id]).toMatchObject({ resolved: true, x: fixed ? aim.x : u.x, y: aim.y });
    expect(u.hp).toBe(fixed ? u.maxHp : u.maxHp - 100);
    expect(bystander.hp).toBe(bystander.maxHp - 100);
  },
);

it.each([
  { version: 240, splashDamage: 0 },
  { version: REPLAY_VERSION, splashDamage: 100 },
])('Air Bomb trigger and splash eligibility in replay $version', ({ version, splashDamage }) => {
  const { b: template, u: balloon, trap } = arena('airbomb', 1, 'balloon');
  const b = replayBattle(
    {
      index: 0,
      practice: true,
      buildings: [trap],
      army: emptyArmy(),
      spells: emptySpells(),
      troopLevels: template.troopLevels,
      nextId: 9006,
    },
    version,
  );
  const bat: Unit = {
    ...balloon,
    id: 9003,
    kind: 'spellbat',
    native: initialNativeState('spellbat', 1),
  };
  const outside = { ...bat, id: 9004, x: bat.x + 3.1 };
  const ground: Unit = { ...bat, id: 9005, kind: 'spellskeleton' };
  b.started = true;
  b.units = [bat, outside, ground];
  b.elapsed = 0.05;
  stepTraps(b, 0.05, () => {});
  expect(b.traps[trap.id]).toBeUndefined();

  b.units.push(balloon);
  b.elapsed += 0.05;
  stepTraps(b, 0.05, () => {});
  expect(b.traps[trap.id]?.targetId).toBe(balloon.id);
  b.elapsed += trapStats('airbomb', 1)!.delay;
  stepTraps(b, 0.05, () => {});
  expect(balloon.hp).toBe(balloon.maxHp - 100);
  expect(bat.hp).toBe(bat.maxHp - splashDamage);
  expect(outside.hp).toBe(outside.maxHp);
  expect(ground.hp).toBe(ground.maxHp);
});

it.each([
  { kind: 'bomb', version: 250, damage: 20, splashDamage: 0 },
  { kind: 'bomb', version: 251, damage: 20, splashDamage: 20 },
  { kind: 'giantbomb', version: 251, damage: 175, splashDamage: 0 },
  { kind: 'giantbomb', version: REPLAY_VERSION, damage: 175, splashDamage: 175 },
] as const)(
  '$kind trigger and splash eligibility in replay $version',
  ({ kind, version, damage, splashDamage }) => {
    const { b: template, u: giant, trap } = arena(kind, 1);
    const battle = replayBattle(
      {
        index: 0,
        practice: true,
        buildings: [trap],
        army: emptyArmy(),
        spells: emptySpells(),
        troopLevels: template.troopLevels,
        nextId: 9007,
      },
      version,
    );
    const skeleton: Unit = {
      ...giant,
      id: 9003,
      kind: 'spellskeleton',
      native: initialNativeState('spellskeleton', 1),
    };
    const outside = { ...skeleton, id: 9004, x: skeleton.x + 3.1 };
    const air: Unit = { ...skeleton, id: 9005, kind: 'spellbat' };
    const burrowed: Unit = {
      ...skeleton,
      id: 9006,
      native: { ...skeleton.native!, burrowed: true },
    };
    battle.started = true;
    battle.units = [skeleton, outside, air, burrowed];
    battle.elapsed = 0.05;
    stepTraps(battle, 0.05, () => {});
    expect(battle.traps[trap.id]).toBeUndefined();

    battle.units.push(giant);
    battle.elapsed += 0.05;
    stepTraps(battle, 0.05, () => {});
    expect(battle.traps[trap.id]?.targetId).toBe(giant.id);
    battle.elapsed += trapStats(kind, 1)!.delay;
    stepTraps(battle, 0.05, () => {});
    expect(giant.hp).toBe(giant.maxHp - damage);
    expect(skeleton.hp).toBe(skeleton.maxHp - splashDamage);
    for (const unit of [outside, air, burrowed]) expect(unit.hp).toBe(unit.maxHp);
  },
);

it.each([300, 301])('keeps Rolling Terror’s Giant Bomb layer and housing limits in replay %i', (version) => {
  const trap = nativeBuildings(46).find((b) => b.id === 1185)!;
  const source = nativeTrapValues('giantbomb', trap.level);
  expect(source).toMatchObject({ ground: true, air: false, pushback: 1, pushbackHousing: 3 });
  const { b: template, u } = arena('giantbomb', 1);
  const b = replayBattle({
    index: 46,
    catalog: 'goblin-v1',
    practice: false,
    buildings: [trap],
    army: emptyArmy(),
    spells: emptySpells(),
    troopLevels: template.troopLevels,
    nextId: 9004,
  }, version);
  b.started = true;
  const x = trap.x + 1.5, y = trap.y + 1;
  const flyer: Unit = { ...u, id: 9001, kind: 'dragon', x, y };
  const giant: Unit = { ...u, id: 9002, kind: 'giant', x, y };
  const small: Unit = { ...u, id: 9003, kind: 'swordsman', x, y };
  b.units = [flyer];
  b.elapsed = 0.05;
  stepTraps(b, 0.05, () => {});
  expect(b.traps[trap.id]).toBeUndefined();

  b.units.push(giant, small);
  b.elapsed = 0.1;
  stepTraps(b, 0.05, () => {});
  expect(b.traps[trap.id].targetId).toBe(giant.id);
  b.elapsed += trapStats('giantbomb', trap.level)!.delay;
  stepTraps(b, 0.05, () => {});
  expect(b.traps[trap.id].resolved).toBe(true);
  expect(small.hp).toBe(small.maxHp - source.damage);
  expect(giant.hp).toBe(giant.maxHp - source.damage);
  expect(flyer.hp).toBe(flyer.maxHp);
  expect(giant.airPush).toBeUndefined();
  expect(flyer.airPush).toBeUndefined();
  if (version === 300) expect(small.airPush).toBeUndefined();
  else {
    expect(small.airPush).toMatchObject({ y: 0, remaining: 0.3 });
    expect(small.airPush!.x * small.airPush!.remaining).toBeCloseTo(source.pushback);
  }
});

it.each([301, 302])('keeps ordinary Campaign Bomb reach and housing rules in replay %i', (version) => {
  const trap = nativeBuildings(2).find((b) => b.id === 1070)!;
  const source = nativeTrapValues('bomb', trap.level);
  expect(source).toMatchObject({
    damage: 20, trigger: 1.5, radius: 3, ground: true, air: false,
    pushback: 1, pushbackHousing: 3,
  });
  const { b: template, u } = arena('bomb', 1);
  const b = replayBattle({
    index: 2,
    catalog: 'goblin-v1',
    practice: false,
    buildings: [trap, makeBuilding(9010, 'wall', trap.x + 2, trap.y)],
    army: emptyArmy(),
    spells: emptySpells(),
    troopLevels: template.troopLevels,
    nextId: 9020,
  }, version);
  b.started = true;
  const x = trap.x + 0.5, y = trap.y + 0.5;
  const flyer: Unit = { ...u, id: 9001, kind: 'dragon', x, y };
  const outsideTrigger: Unit = { ...u, id: 9002, kind: 'swordsman', x: x - 1.6, y };
  const giant: Unit = { ...u, id: 9003, kind: 'giant', x: x + 0.9, y };
  const obstructed: Unit = { ...u, id: 9004, kind: 'swordsman', x: x + 0.9, y };
  const outsideBlast: Unit = { ...u, id: 9005, kind: 'swordsman', x: x - 3.1, y };
  b.units = [flyer, outsideTrigger, outsideBlast];
  b.elapsed = 0.05;
  stepTraps(b, 0.05, () => {});
  expect(b.traps[trap.id]).toBeUndefined();

  b.units.push(giant, obstructed);
  b.elapsed = 0.1;
  stepTraps(b, 0.05, () => {});
  expect(b.traps[trap.id].targetId).toBe(giant.id);
  b.elapsed += trapStats('bomb', trap.level)!.delay;
  stepTraps(b, 0.05, () => {});
  expect(b.traps[trap.id].resolved).toBe(true);
  for (const unit of [outsideTrigger, obstructed, giant])
    expect(unit.hp).toBe(unit.maxHp - source.damage);
  for (const unit of [flyer, outsideBlast]) expect(unit.hp).toBe(unit.maxHp);
  for (const unit of [giant, flyer, outsideBlast]) expect(unit.airPush).toBeUndefined();
  if (version === 301) {
    expect(outsideTrigger.airPush).toBeUndefined();
    expect(obstructed.airPush).toBeUndefined();
  } else {
    expect(outsideTrigger.airPush!.x * outsideTrigger.airPush!.remaining).toBeCloseTo(-1);
    expect(obstructed.airPush!.x * obstructed.airPush!.remaining).toBeCloseTo(0.6);
  }
});

it('Giant Bomb radius grows at levels 2 and 4', () => {
  expect([1, 2, 3, 4, 5].map((level) => trapStats('giantbomb', level)!.radius)).toEqual([
    3, 3.5, 3.5, 4, 4,
  ]);
});
it('Spring Trap levels apply half hero damage and stun in place, including zero damage at level 1', () => {
  for (let level = 1; level <= 5; level++) {
    const { b, u } = arena('springtrap', level);
    u.hero = 'king';
    b.elapsed = 0.05;
    stepTraps(b, 0.05, () => {});
    expect(u.hp).toBe(u.maxHp - expected.springtrap.damage[level - 1] / 2);
    expect([u.x, u.y, u.ejected, u.springUntil]).toEqual([10.5, 10.5, false, 0.65]);
  }
});

it('a stunned hero still receives healing while movement and attacks are suspended', () => {
  const { m, b, u } = arena('springtrap', 1);
  u.hero = 'king';
  u.hp = 1000;
  u.springUntil = 1;
  u.attacking = true;
  b.auras.push({ kind: 'heal', x: u.x, y: u.y, start: 0, end: 12.3, pulses: 0 });
  m.step(0.1);
  expect(u.hp).toBe(1000 + 15 * 0.55);
  expect([u.x, u.y, u.attacking]).toEqual([10.5, 10.5, false]);
});

it('ending a battle prevents a pending Bomb from damaging troops later', () => {
  const { m, b, u } = arena('bomb', 1);
  stepTraps(b, 0.05, () => {});
  expect(b.traps[9000].resolved).toBe(false);
  m.finishBattle();
  m.step(2);
  expect(u.hp).toBe(u.maxHp);
});
