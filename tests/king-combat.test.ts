import { describe, expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import {
  heroStats,
  heroRecovery,
  heroLevelCap,
  heroUpgradeCost,
  heroUpgradeSeconds,
} from '../src/game/heroes';
import { KING_LEVELS } from '../src/game/king-progression';
import catalog from '../reference/townhall/catalog.json';
import { validateSave } from '../src/game/save';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { REPLAY_VERSION } from '../src/game/replay';
import { launchProjectile, stepProjectiles } from '../src/game/projectiles';
import { stepDeathBombs } from '../src/game/bomb-tower';
import { startSpellAura, stepSpellAuras } from '../src/game/spell-effects';

function village(th = 7, level = 1) {
  const m = new GameModel();
  m.state.obstacles = [];
  m.state.buildings = [
    makeBuilding(1, 'townhall', 20, 20, th),
    makeBuilding(2, 'herohall', 4, 4, th === 8 ? 2 : 1),
    makeBuilding(3, 'builder', 30, 30),
  ];
  m.state.nextId = 4;
  m.state.army = emptyArmy();
  m.state.spells = emptySpells();
  m.state.king = { level };
  return m;
}
function arena(th = 7, level = 1) {
  const m = village(th, level);
  m.startBattle(0, true);
  expect(m.deployHero(12, 15)).toBe(true);
  const b = m.battle!,
    king = b.units[0];
  b.buildings = [makeBuilding(100, 'townhall', 20, 20)];
  b.buildings[0].hp = b.buildings[0].maxHp = 100000;
  return { m, b, king, target: b.buildings[0] };
}

describe('native King progression and default equipment', () => {
  it('uses all thirty base-health/DPS records and destination upgrade costs', () => {
    expect(KING_LEVELS.map((l) => l.hp)).toEqual([
      1445, 1481, 1518, 1556, 1595, 1635, 1675, 1717, 1760, 1805, 1850, 1896, 1943, 1992, 2042,
      2093, 2145, 2198, 2253, 2309, 2367, 2427, 2487, 2549, 2613, 2678, 2746, 2814, 2885, 2956,
    ]);
    expect(KING_LEVELS.map((l) => l.dps)).toEqual([
      102, 104, 105, 108, 110, 112, 115, 116, 119, 122, 124, 127, 129, 132, 134, 137, 139, 143, 145,
      148, 151, 154, 157, 161, 164, 167, 170, 173, 177, 181,
    ]);
    expect(KING_LEVELS.map((l) => l.recovery).slice(19)).toEqual([
      450, 450, 450, 450, 450, 525, 525, 525, 525, 525, 625,
    ]);
    expect(Array.from({ length: 29 }, (_, i) => heroUpgradeCost(i + 1))).toEqual([
      5000, 5500, 6000, 6500, 7000, 7500, 8000, 8500, 10000, 10500, 11000, 11500, 12000, 12500,
      13000, 13500, 14000, 14500, 15000, 17000, 19000, 21000, 23000, 25000, 27000, 29000, 31000,
      33000, 35000,
    ]);
    expect(Array.from({ length: 29 }, (_, i) => heroUpgradeSeconds(i + 1) / 3600)).toEqual([
      2, 4, 8, 10, 12, 14, 16, 18, 20, 22, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24,
      48, 48, 48, 48, 48,
    ]);
    expect(Array.from({ length: 9 }, (_, i) => heroLevelCap(i + 1, 1))).toEqual([
      0, 0, 0, 1, 1, 1, 10, 10, 10,
    ]);
    expect(heroLevelCap(8, 2)).toBe(20);
    expect(heroLevelCap(9, 2)).toBe(20);
    expect(heroLevelCap(9, 3)).toBe(30);
    expect(heroLevelCap(8, 3)).toBe(20);
    expect(heroLevelCap(8, 0)).toBe(0);
    // Every King record reproduces the pinned client table it was transcribed from.
    expect(KING_LEVELS.map((l, i) => ({ level: i + 1, ...l }))).toEqual(
      catalog.heroes.barbarianKing,
    );
  });
  it.each([
    [4, 877, 59.5, 71.4, 230],
    [5, 1315.5, 89.25, 107.1, 345],
    [6, 1754, 119, 142.8, 460],
    [7, 1754, 119, 142.8, 460],
  ])(
    'TH%i scales health, damage and fixed recovery while preserving range and movement',
    (th, hp, dps, damage, recovery) => {
      const { king } = arena(th);
      expect(king.maxHp).toBe(hp);
      expect(heroStats(1, th)).toMatchObject({ hp, dps, speed: 2, range: 1, rate: 1.2 });
      expect(heroStats(1, th).damage).toBeCloseTo(damage);
      expect(heroRecovery(1, th)).toBe(recovery);
    },
  );
  it('keeps equipment at level one while hero health, DPS and intrinsic recovery progress', () => {
    expect(heroStats(20, 8)).toMatchObject({ hp: 2618, dps: 165, damage: 198 });
    expect([1, 5, 10, 15, 20].map((level) => heroRecovery(level, 8))).toEqual([
      460, 510, 570, 635, 710,
    ]);
  });
  it.each([1, 9, 10, 19])(
    'level %i upgrade charges once, retains its deadline through save/reload, and completes once',
    (level) => {
      const m = village(8, level);
      m.state.dark = 50000;
      const cost = heroUpgradeCost(level),
        seconds = heroUpgradeSeconds(level),
        start = m.clock;
      expect(m.upgradeHero()).toBe(true);
      expect(m.state.dark).toBe(50000 - cost);
      expect(m.state.king).toEqual({
        level,
        upgradeStart: start,
        upgradeEnd: start + seconds * 1000,
      });
      expect(m.busy).toBe(1);
      expect(m.upgradeHero()).toBe(false);
      expect(validateSave(m.state)).toBe(true);
      const loaded = new GameModel(JSON.parse(JSON.stringify(m.state)));
      loaded.tick(start + seconds * 1000 - 1);
      expect(loaded.state.king!.level).toBe(level);
      loaded.tick(start + seconds * 1000);
      loaded.tick(start + seconds * 1000 + 1);
      expect(loaded.state.king).toEqual({ level: level + 1 });
      expect(loaded.state.dark).toBe(50000 - cost);
      expect(loaded.busy).toBe(0);
    },
  );
  it('honors an already paid legacy timer without repricing or restarting it', () => {
    const m = village();
    m.state.dark = 3500;
    m.state.king = { level: 1, upgradeStart: m.clock, upgradeEnd: m.clock + 300000 };
    const loaded = new GameModel(JSON.parse(JSON.stringify(m.state)));
    expect(loaded.state.king!.upgradeEnd).toBe(m.clock + 300000);
    loaded.tick(m.clock + 300000);
    expect(loaded.state.king).toEqual({ level: 2 });
    expect(loaded.state.dark).toBe(3500);
  });
});

describe('King equipment activation', () => {
  it('scheduled blasts and healing cannot affect a summon before its birth', () => {
    const { m, b, king } = arena();
    m.activateHeroAbility();
    const summon = b.units[1];
    summon.spawnedAt = 0.5;
    summon.hp = 10;
    // A delayed update may contain both an old projectile impact and a new wave.
    for (const [weapon, impact, expected] of [
      ['arcane', 0.499, 10],
      ['healing', 0.499, 10],
      ['arcane', 0.5, 5],
      ['healing', 0.5, 10],
    ] as const) {
      b.projectiles = [];
      const shot = launchProjectile(
        b,
        {
          weapon,
          sourceId: 777,
          targetId: king.id,
          targetBuilding: false,
          fromX: king.x,
          fromY: king.y,
          x: king.x,
          y: king.y,
          damage: 5,
          splash: 1,
        },
        () => {},
      );
      shot.impact = impact;
      b.elapsed = 1;
      stepProjectiles(
        b,
        () => {},
        () => {},
      );
      expect(summon.hp).toBe(expected);
    }
    b.deathBombs = {
      88: {
        sourceId: 88,
        x: king.x,
        y: king.y,
        armedAt: -0.501,
        impact: 0.499,
        damage: 5,
        resolved: false,
      },
    };
    stepDeathBombs(b, () => {});
    expect(summon.hp).toBe(10);
    b.deathBombs[88].resolved = false;
    b.deathBombs[88].impact = 0.5;
    stepDeathBombs(b, () => {});
    expect(summon.hp).toBe(5);
    b.auras = [];
    b.elapsed = 0;
    startSpellAura(b, 'heal', summon.x, summon.y);
    expect(summon.hp).toBe(5);
    b.elapsed = 0.3;
    stepSpellAuras(b);
    expect(summon.hp).toBe(5);
    b.elapsed = 0.6;
    stepSpellAuras(b);
    expect(summon.hp).toBeGreaterThan(5);
  });
  it('releases five Barbarians immediately and three at the half-second boundary, using snapshotted research', () => {
    const { m, b, king } = arena(4);
    b.troopLevels.swordsman = 5;
    king.hp = 100;
    expect(m.activateHeroAbility()).toBe(true);
    expect(king.hp).toBe(330);
    expect(b.units.filter((u) => u.summoned)).toHaveLength(5);
    expect(
      b.units
        .filter((u) => u.summoned)
        .every((u) => u.maxHp === 105 && u.spawnedAt === 0 && u.rageUntil === 20),
    ).toBe(true);
    m.state.troopLevels = { ...b.troopLevels, swordsman: 1 };
    m.step(0.499);
    expect(b.units).toHaveLength(6);
    m.step(0.001);
    expect(b.units).toHaveLength(9);
    expect(
      b.units
        .slice(-3)
        .every((u) => u.maxHp === 105 && u.spawnedAt === 0.5 && u.rageUntil === 20.5),
    ).toBe(true);
    expect(m.activateHeroAbility()).toBe(false);
    expect(b.remaining).toEqual(emptyArmy());
    expect(b.carriedArmy).toEqual(emptyArmy());
    m.step(1);
    expect(b.units).toHaveLength(9);
  });
  it('retains scheduled times across a wide frame and cancels remaining summons after King defeat', () => {
    const { m, b, king } = arena();
    m.activateHeroAbility();
    m.step(1);
    expect(b.units.slice(-3).map((u) => u.spawnedAt)).toEqual([0.5, 0.5, 0.5]);
    const dead = arena();
    dead.m.activateHeroAbility();
    dead.king.hp = 0;
    dead.m.step(0.5);
    expect(dead.b.units.filter((u) => u.summoned)).toHaveLength(5);
    m.finishBattle();
    const end = structuredClone(b.units);
    m.step(1);
    expect(b.units).toEqual(end);
    expect(king.hp).toBeGreaterThan(0);
  });
  it('uses one-tile melee reach and 2.2× damage during the ten-second Vial effect', () => {
    const { m, b, king, target } = arena();
    king.x = 19;
    king.y = 21;
    king.target = target.id;
    m.step(0.05);
    expect(target.maxHp - target.hp).toBeCloseTo(142.8);
    b.hero!.abilityUsed = true;
    b.hero!.rageUntil = 10;
    king.cooldown = 0;
    m.step(0.05);
    expect(target.maxHp - target.hp).toBeCloseTo(142.8 + 314.16);
    expect(king.cooldown).toBe(1.2);
    b.elapsed = 10;
    king.cooldown = 0;
    m.step(0.05);
    expect(target.maxHp - target.hp).toBeCloseTo(142.8 * 2 + 314.16);
    king.x = 18.999;
    king.cooldown = 0;
    const hp = target.hp;
    m.step(0.00001);
    expect(target.hp).toBe(hp);
  });
  it.each([false, true])('movement uses a flat 2.25 tiles/s Vial bonus (active=%s)', (active) => {
    const { m, b, king, target } = arena();
    king.x = 10;
    king.y = 15;
    king.target = target.id;
    king.path = [{ x: 15, y: 15 }];
    king.pathAt = 10;
    b.hero!.abilityUsed = true;
    b.hero!.rageUntil = active ? 10 : 0;
    m.step(0.1);
    expect(king.x).toBeCloseTo(active ? 10.425 : 10.2);
  });
  it('boosts Puppet Barbarians independently for twenty seconds and leaves ordinary troops alone', () => {
    const { m, b, king, target } = arena();
    b.troopLevels.swordsman = 5;
    m.activateHeroAbility();
    king.hp = 0;
    for (const unit of b.units.slice(2)) unit.hp = 0;
    const summoned = b.units[1];
    summoned.x = 19.7;
    summoned.y = 21;
    summoned.target = target.id;
    m.step(0.05);
    expect(target.maxHp - target.hp).toBeCloseTo(46);
    b.elapsed = 20;
    summoned.cooldown = 0;
    m.step(0.05);
    expect(target.maxHp - target.hp).toBeCloseTo(69);
    const ordinary = {
      ...summoned,
      id: 999,
      summoned: undefined,
      rageUntil: undefined,
      cooldown: 0,
    };
    summoned.cooldown = 100;
    b.units.push(ordinary);
    m.step(0.05);
    expect(target.maxHp - target.hp).toBeCloseTo(92);
  });
  it('caps recovery at maximum health and does not rescue damage greater than the available recovery', () => {
    const full = arena();
    full.king.hp = full.king.maxHp - 1;
    full.m.activateHeroAbility();
    expect(full.king.hp).toBe(full.king.maxHp);
    const lethal = arena();
    lethal.king.hp = -461;
    lethal.m.step(0.05);
    expect(lethal.b.hero!.abilityUsed).toBe(true);
    expect(lethal.king.hp).toBe(-1);
    expect(lethal.king.spent).toBe(true);
    expect(lethal.b.units).toHaveLength(1);
    expect(lethal.b.finished).toBe(true);
  });
  it('replays default equipment and timed summons after portable export and seeks on either side of the second wave', () => {
    const m = village(4);
    m.startBattle(0, true);
    m.deployHero(12, 15);
    m.activateHeroAbility();
    for (let i = 0; i < 20; i++) m.step(0.05);
    m.finishBattle();
    const original = structuredClone(m.battle!),
      record = m.state.raidLog![0];
    const data = parseReplayFile(JSON.stringify(makeReplayFile(record.replay!)));
    expect(data.version).toBe(REPLAY_VERSION);
    const viewer = new GameModel();
    expect(viewer.openReplay(data)).toBe(true);
    for (let i = 0; i < 100 && !viewer.replay!.complete; i++) viewer.step(0.05);
    expect(viewer.battle!.units).toEqual(original.units);
    expect(viewer.battle!.hero).toEqual(original.hero);
    for (const [at, count] of [
      [0.45, 5],
      [0.55, 8],
      [0, 5],
    ] as const) {
      viewer.seekReplay(at);
      for (let i = 0; i < 100 && viewer.replay!.seeking; i++) viewer.step(0.05);
      expect(viewer.battle!.units.filter((u) => u.summoned)).toHaveLength(count);
    }
    expect(viewer.state.king).toBeUndefined();
  });
});
