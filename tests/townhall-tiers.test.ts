import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import {
  asset,
  BUILDINGS,
  BUILDING_KEYS,
  MAX_TOWNHALL,
  maxCountFor,
  maxLevelFor,
  buildPrice,
  storageCapacity,
  townHallCapacity,
  unlockTownHall,
  upgradeCost,
  upgradeSeconds,
  type BuildingKind,
} from '../src/game/data';
import { requiredTownHall } from '../src/game/progression';
import { BUILDING_COUNTS, BUILDING_LEVELS, WITHHELD } from '../src/game/tiers';
import { SOURCE_NAME, sourceCeiling, sourceCount } from '../src/game/townhall-catalog';
import { campCapacity } from '../src/game/camp-stats';
import { spellFactoryCapacity } from '../src/game/facility-progression';
import { heroLevelCap, heroUpgradeCost, HERO_MAX_LEVEL } from '../src/game/heroes';
import { GameModel } from '../src/game/model';
import { REPLAY_VERSION, validateReplay } from '../src/game/replay';
import { validateSave } from '../src/game/save';

const TIERS = Array.from({ length: MAX_TOWNHALL }, (_, index) => index + 1);
/** Counts this game deliberately differs on below Town Hall 9; all converge by Town Hall 9. */
const LOCAL_COUNTS = new Set<BuildingKind>([
  'cannon',
  'goldmine',
  'collector',
  'goldstorage',
  'elixirstorage',
  'builder',
]);

describe('Town Hall tier catalog', () => {
  it('runs to the catalog ceiling and never withdraws content', () => {
    expect(MAX_TOWNHALL).toBe(18);
    expect(BUILDINGS.townhall.maxLevel).toBe(MAX_TOWNHALL);
    for (const kind of BUILDING_KEYS) {
      expect(BUILDING_COUNTS[kind], kind).toHaveLength(MAX_TOWNHALL);
      expect(BUILDING_LEVELS[kind], kind).toHaveLength(MAX_TOWNHALL);
      for (let th = 1; th < MAX_TOWNHALL; th++) {
        expect(maxCountFor(kind, th + 1), kind).toBeGreaterThanOrEqual(maxCountFor(kind, th));
        expect(BUILDING_LEVELS[kind][th], kind).toBeGreaterThanOrEqual(
          BUILDING_LEVELS[kind][th - 1],
        );
      }
      // A tier that permits none of a building never advertises a level for it.
      for (const th of TIERS)
        if (maxCountFor(kind, th) === 0) expect(maxLevelFor(kind, th), `${kind} TH${th}`).toBe(0);
      // Nothing exceeds what the game implements.
      expect(maxLevelFor(kind, MAX_TOWNHALL), kind).toBeLessThanOrEqual(BUILDINGS[kind].maxLevel);
    }
    // Levels above the ceiling clamp instead of reading past the table.
    expect(maxLevelFor('cannon', 40)).toBe(maxLevelFor('cannon', MAX_TOWNHALL));
    expect(maxCountFor('xbow', 40)).toBe(maxCountFor('xbow', MAX_TOWNHALL));
  });

  it('matches the pinned source counts and ceilings at every tier', () => {
    for (const kind of BUILDING_KEYS) {
      const name = SOURCE_NAME[kind]!;
      expect(name, kind).toBeTruthy();
      const withheld = WITHHELD[kind];
      for (const th of TIERS) {
        // The Town Hall is never a counted column: a village always has exactly one. And a
        // tier that permits no level of a building permits none of it, which is how the
        // Clan Castle is counted from Town Hall 1 but has nothing to place until Town Hall 3.
        if (name !== 'Town Hall' && !(withheld?.level === 0))
          if (!LOCAL_COUNTS.has(kind) || th > 9)
            expect(maxCountFor(kind, th), `${name} count TH${th}`).toBe(
              sourceCeiling(name, th) === 0 ? 0 : sourceCount(name, th),
            );
        if (maxCountFor(kind, th) === 0) continue;
        const source = name === 'Town Hall' ? MAX_TOWNHALL : sourceCeiling(name, th);
        expect(maxLevelFor(kind, th), `${name} level TH${th}`).toBe(
          Math.min(withheld?.level ?? Number.MAX_SAFE_INTEGER, source),
        );
      }
      // Every withheld entry is genuinely short of what the original permits, and says why.
      if (withheld) {
        expect(withheld.why.length, kind).toBeGreaterThan(0);
        expect(withheld.level, `${name} gap`).toBeLessThan(sourceCeiling(name, MAX_TOWNHALL));
      }
    }
    // Only the Builder's Hut still stops short, and for artwork rather than for data.
    expect(Object.keys(WITHHELD).sort()).toEqual(['builder']);
  });

  it('reports the original Town Hall requirement for the levels each tier adds', () => {
    const added: [BuildingKind, number, number][] = [
      ['xbow', 1, 9],
      ['xbow', 4, 10],
      ['cannon', 11, 9],
      ['cannon', 21, 15],
      ['archertower', 11, 9],
      ['mortar', 7, 9],
      ['airdefense', 7, 9],
      ['airdefense', 16, 18],
      ['wizardtower', 7, 9],
      ['tesla', 7, 9],
      ['bombtower', 3, 9],
      ['airsweeper', 5, 9],
      ['darkdrill', 6, 9],
      ['darkdrill', 11, 16],
      ['darkstorage', 6, 9],
      ['seekingairmine', 2, 9],
      ['skeletontrap', 3, 9],
      ['skeletontrap', 4, 10],
      ['skeletontrap', 5, 18],
      ['bomb', 6, 9],
      ['bomb', 14, 18],
      ['airbomb', 4, 9],
      ['springtrap', 4, 9],
      ['wall', 10, 9],
      ['wall', 19, 18],
      ['camp', 7, 9],
      ['camp', 14, 18],
      ['barracks', 11, 9],
      ['laboratory', 7, 9],
      ['laboratory', 16, 18],
      ['spellfactory', 4, 9],
      ['herohall', 3, 9],
      ['herohall', 12, 18],
      ['goldstorage', 19, 18],
      ['goldmine', 17, 16],
    ];
    for (const [kind, level, townhall] of added)
      expect(requiredTownHall(kind, level), `${kind} ${level}`).toBe(townhall);
    expect(unlockTownHall('xbow')).toBe(9);
    // A withheld level reports no requirement at all, because it is never reachable.
    expect(requiredTownHall('builder', 5)).toBeNull();
    // The Blacksmith and the Clan Castle now report theirs: both reach their own last level.
    expect(requiredTownHall('blacksmith', 2)).toBe(9);
    expect(unlockTownHall('clancastle')).toBe(3);
    expect(requiredTownHall('clancastle', 14)).toBe(18);
    expect(maxLevelFor('clancastle', 2)).toBe(0);
    expect(maxCountFor('clancastle', 2)).toBe(0);
    expect(maxCountFor('clancastle', 3)).toBe(1);
    // The Town Hall's own ceiling is the catalog maximum from the first tier onwards.
    for (const th of TIERS) expect(maxLevelFor('townhall', th)).toBe(MAX_TOWNHALL);
  });

  it('raises army housing, spell housing and hero levels with the tier', () => {
    const housing = (th: number) => maxCountFor('camp', th) * campCapacity(maxLevelFor('camp', th));
    expect(housing(9)).toBe(220);
    expect(housing(MAX_TOWNHALL)).toBe(352);
    expect(spellFactoryCapacity(maxLevelFor('spellfactory', 9))).toBe(8);
    expect(spellFactoryCapacity(maxLevelFor('spellfactory', MAX_TOWNHALL))).toBe(10);
    expect(HERO_MAX_LEVEL).toBe(110);
    expect(heroLevelCap(9, 3)).toBe(30);
    expect(heroLevelCap(MAX_TOWNHALL, 12)).toBe(110);
    // Both the Town Hall and the Hero Hall have to permit a level.
    expect(heroLevelCap(MAX_TOWNHALL, 3)).toBe(30);
    expect(heroLevelCap(9, 12)).toBe(30);
    expect(heroUpgradeCost(20)).toBe(17000);
    expect(heroUpgradeCost(HERO_MAX_LEVEL)).toBe(0);
  });

  it('keeps every purchase affordable within the storage its own tier allows', () => {
    for (const th of TIERS)
      for (const resource of ['gold', 'elixir'] as const) {
        const store = resource === 'gold' ? 'goldstorage' : 'elixirstorage';
        // The original counts the Town Hall's own store toward the cap, stores on top of it.
        const capacity =
          townHallCapacity(th, resource) +
          maxCountFor(store, th) * storageCapacity(maxLevelFor(store, th));
        for (const kind of BUILDING_KEYS) {
          if (BUILDINGS[kind].resource !== resource || !maxCountFor(kind, th)) continue;
          // A village always has exactly one Town Hall, so its level-1 price is never charged,
          // and a Builder's Hut is bought with gems, which no storage caps.
          const price = buildPrice(kind, 1);
          if (kind !== 'townhall' && price.resource !== 'gems')
            expect(price.cost, `${kind} construction at TH${th}`).toBeLessThanOrEqual(capacity);
          const ceiling =
            kind === 'townhall' ? Math.min(MAX_TOWNHALL, th + 1) : maxLevelFor(kind, th);
          for (let level = kind === 'townhall' ? th : 1; level < ceiling; level++)
            expect(upgradeCost(kind, level), `${kind} ${level + 1} at TH${th}`).toBeLessThanOrEqual(
              capacity,
            );
        }
      }
  });

  it('resolves shipped artwork for every level any tier can reach', () => {
    for (const kind of BUILDING_KEYS) {
      if (!maxCountFor(kind, MAX_TOWNHALL)) continue;
      for (let level = 1; level <= maxLevelFor(kind, MAX_TOWNHALL); level++) {
        const path = asset(kind, level);
        expect(existsSync(`public${path}`), `${kind} ${level}: public${path}`).toBe(true);
      }
    }
  });
});

/** A finished village at the given tier, with room and funds to build. */
function village(townhall = MAX_TOWNHALL) {
  const m = new GameModel();
  m.state.obstacles = [];
  m.townhall!.level = townhall;
  m.state.gold = m.state.elixir = 500_000_000;
  m.state.dark = 2_000_000;
  return m;
}

describe('Town Hall tier village', () => {
  it('unlocks the X-Bow, enforces its count and keeps its mode', () => {
    const m = village(8);
    const tier = 9;
    m.beginBuild('xbow');
    expect(m.placement).toBeNull();
    m.townhall!.level = tier;
    expect(m.maxCount('xbow')).toBe(2);
    for (const [x, y] of [
      [30, 30],
      [34, 30],
    ]) {
      m.beginBuild('xbow');
      expect(m.placement).toBe('xbow');
      expect(m.place(x, y)).toBe(true);
    }
    expect(m.countOf('xbow')).toBe(2);
    m.beginBuild('xbow');
    expect(m.placement).toBeNull();
    const bow = m.state.buildings.find((b) => b.kind === 'xbow')!;
    m.tick(bow.upgradeEnd!);
    expect(bow).toMatchObject({ level: 1, constructing: false });
    // A newly built X-Bow carries no stored mode and defends the ground layer.
    expect(bow.xbowMode).toBeUndefined();
    m.selected = bow.id;
    expect(m.toggleXbowMode()).toBe(true);
    expect(bow.xbowMode).toBe('both');
    expect(m.toggleXbowMode()).toBe(true);
    expect(bow.xbowMode).toBe('ground');
    // Both Town Hall 9 upgrades are purchasable, and the fourth level is not.
    for (const level of [2, 3]) {
      m.upgrade(bow.id);
      expect(bow.upgradeEnd! - bow.upgradeStart!).toBe(upgradeSeconds('xbow', level - 1) * 1000);
      m.tick(bow.upgradeEnd!);
      expect(bow.level).toBe(level);
    }
    m.upgrade(bow.id);
    expect(bow.upgradeEnd).toBeUndefined();
    expect(validateSave(JSON.parse(JSON.stringify(m.state)))).toBe(true);
  });

  it('upgrades the Town Hall from eight to nine and keeps the village intact', () => {
    const m = village(8);
    const before = m.state.buildings.length;
    expect(m.maxCount('xbow')).toBe(0);
    m.upgrade(m.townhall!.id);
    const hall = m.townhall!;
    expect(hall.upgradeEnd! - hall.upgradeStart!).toBe(upgradeSeconds('townhall', 8) * 1000);
    const restored = new GameModel(JSON.parse(JSON.stringify(m.state)));
    restored.tick(restored.townhall!.upgradeEnd!);
    expect(restored.townhallLevel).toBe(9);
    expect(restored.state.buildings).toHaveLength(before);
    expect(restored.maxCount('xbow')).toBe(2);
    expect(restored.maxLevel('cannon')).toBe(11);
    expect(validateSave(restored.state)).toBe(true);
    // The ladder keeps going, one tier at a time, to the catalog ceiling.
    for (let tier = 9; tier < MAX_TOWNHALL; tier++) {
      restored.upgrade(restored.townhall!.id);
      restored.tick(restored.townhall!.upgradeEnd!);
    }
    expect(restored.townhallLevel).toBe(MAX_TOWNHALL);
    restored.upgrade(restored.townhall!.id);
    expect(restored.townhall!.upgradeEnd).toBeUndefined();
  });

  it('takes the King to thirty only with a Hero Hall 3', () => {
    const m = village(9);
    m.beginBuild('herohall');
    expect(m.place(30, 30)).toBe(true);
    const hall = m.state.buildings.at(-1)!;
    m.tick(hall.upgradeEnd!);
    m.upgrade(hall.id);
    m.tick(hall.upgradeEnd!);
    expect(hall.level).toBe(2);
    m.state.king = { level: 20 };
    expect(m.heroMaxLevel).toBe(20);
    expect(m.upgradeHero()).toBe(false);
    m.upgrade(hall.id);
    expect(hall.upgradeEnd! - hall.upgradeStart!).toBe(upgradeSeconds('herohall', 2) * 1000);
    m.tick(hall.upgradeEnd!);
    expect(hall.level).toBe(3);
    expect(m.heroMaxLevel).toBe(30);
    expect(m.upgradeHero()).toBe(true);
    const king = m.state.king!;
    m.tick(king.upgradeEnd!);
    expect(king.level).toBe(21);
    expect(validateSave(JSON.parse(JSON.stringify(m.state)))).toBe(true);
  });

  it('builds, fights and records every late family in the home village', () => {
    const m = village();
    const spots: Record<string, [number, number]> = {
      inferno: [24, 30],
      eagleartillery: [28, 30],
      scattershot: [34, 30],
      monolith: [24, 34],
      spelltower: [28, 34],
      tornadotrap: [32, 34],
    };
    for (const [kind, [x, y]] of Object.entries(spots) as [BuildingKind, [number, number]][]) {
      expect(maxCountFor(kind, MAX_TOWNHALL), kind).toBeGreaterThan(0);
      // Long build times let trees regrow between placements; this village stays cleared.
      m.state.obstacles = [];
      m.beginBuild(kind);
      expect(m.placement, kind).toBe(kind);
      expect(m.place(x, y), kind).toBe(true);
      const built = m.state.buildings.at(-1)!;
      m.tick(built.upgradeEnd ?? m.clock + 1);
      // Traps are placed armed; the rest finish construction first.
      expect(built).toMatchObject({ kind, level: 1 });
      expect(built.constructing ?? false).toBe(false);
    }
    // A home Spell Tower always carries a weapon, and cycles through all three.
    const tower = m.state.buildings.find((b) => b.kind === 'spelltower')!;
    expect(tower.spellTowerWeapon).toBe('rage');
    m.selected = tower.id;
    for (const weapon of ['poison', 'invisibility', 'rage']) {
      expect(m.cycleSpellTowerWeapon()).toBe(true);
      expect(tower.spellTowerWeapon).toBe(weapon);
    }
    expect(validateSave(JSON.parse(JSON.stringify(m.state)))).toBe(true);

    // Practice steps late-family state, which campaign battles alone used to carry.
    m.startBattle(0, true);
    expect(m.battle!.late).toEqual({});
    m.deploy(1, 1);
    for (let step = 0; step < 40; step++) m.step(0.05);
    m.finishBattle();
    const replay = JSON.parse(JSON.stringify(m.state.raidLog![0].replay!));
    expect(validateReplay(replay)).toBe(true);
    // Earlier recordings never held a late family outside a campaign village.
    expect(validateReplay({ ...replay, version: 45 })).toBe(false);
  });

  it('records later-tier battles at version 46 and refuses them in earlier recordings', () => {
    const record = (m: GameModel) => {
      m.startBattle(0, true);
      m.deploy(1, 1);
      m.step(0.05);
      m.finishBattle();
      return JSON.parse(JSON.stringify(m.state.raidLog![0].replay!));
    };
    const raise = (m: GameModel, kind: BuildingKind, level: number) => {
      m.state.obstacles = [];
      m.beginBuild(kind);
      expect(m.place(30, 30)).toBe(true);
      const built = m.state.buildings.at(-1)!;
      // A trap whose first row costs no time is finished the moment it is placed, so it has
      // no completion stamp to advance to.
      const finish = () => {
        if (built.upgradeEnd !== undefined) m.tick(built.upgradeEnd);
      };
      finish();
      while (built.level < level) {
        const before = built.level;
        m.upgrade(built.id);
        finish();
        // Assert forward progress rather than looping on it: an upgrade that cannot start
        // would otherwise spin here forever instead of failing.
        expect(built.level, `${kind} stalled at level ${before}`).toBeGreaterThan(before);
      }
      expect(built.level).toBe(level);
      return built;
    };

    // A Town Hall 9 village still fits inside a version-45 recording unchanged.
    const ninth = village(9);
    raise(ninth, 'laboratory', 7);
    const old = record(ninth);
    expect(old.version).toBe(REPLAY_VERSION);
    expect(REPLAY_VERSION).toBe(47);
    expect(validateReplay(old)).toBe(true);
    expect(validateReplay({ ...old, version: 45 })).toBe(true);
    expect(validateReplay({ ...old, version: 44 })).toBe(false);

    // The fifth coffin tier is version 47's own: no earlier recording may hold one.
    const coffins = village();
    raise(coffins, 'skeletontrap', 5);
    const fifth = record(coffins);
    expect(validateReplay(fifth)).toBe(true);
    expect(validateReplay({ ...fifth, version: 46 })).toBe(false);

    // A Laboratory 16 needs the Town Hall 18 ladder, which arrived at version 46. That
    // recording still holds it; only the three older than it refuse the level.
    const latest = village();
    raise(latest, 'laboratory', 16);
    const current = record(latest);
    expect(validateReplay(current)).toBe(true);
    expect(validateReplay({ ...current, version: 46 })).toBe(true);
    for (const version of [43, 44, 45])
      expect(validateReplay({ ...current, version }), `version ${version}`).toBe(false);
  });
});
