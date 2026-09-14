import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import catalog from '../reference/townhall/catalog.json';
import {
  asset,
  BUILDINGS,
  BUILDING_KEYS,
  MAX_TOWNHALL,
  maxCountFor,
  maxLevelFor,
  storageCapacity,
  unlockTownHall,
  upgradeCost,
  upgradeSeconds,
  type BuildingKind,
} from '../src/game/data';
import { BUILDING_LEVELS, requiredTownHall } from '../src/game/progression';
import { campCapacity } from '../src/game/camp-stats';
import { spellFactoryCapacity } from '../src/game/facility-progression';
import { heroLevelCap, heroUpgradeCost, HERO_MAX_LEVEL } from '../src/game/heroes';
import { GameModel } from '../src/game/model';
import { REPLAY_VERSION, validateReplay } from '../src/game/replay';
import { validateSave } from '../src/game/save';

/** Every home kind the pinned tier table also names. */
const SOURCE_NAMES: Partial<Record<BuildingKind, string>> = {
  townhall: 'Town Hall',
  camp: 'Army Camp',
  elixirstorage: 'Elixir Storage',
  goldstorage: 'Gold Storage',
  collector: 'Elixir Collector',
  goldmine: 'Gold Mine',
  barracks: 'Barracks',
  builder: 'Builders Hut',
  laboratory: 'Laboratory',
  spellfactory: 'Spell Factory',
  wall: 'Wall',
  herohall: 'Hero Hall',
  blacksmith: 'Blacksmith',
  clancastle: 'Clan Castle',
  cannon: 'Cannon',
  archertower: 'Archer Tower',
  mortar: 'Mortar',
  airdefense: 'Air Defense',
  wizardtower: 'Wizard Tower',
  tesla: 'Hidden Tesla',
  bombtower: 'Bomb Tower',
  xbow: 'X-Bow',
  airsweeper: 'Air Sweeper',
  darkdrill: 'Dark Elixir Drill',
  darkstorage: 'Dark Elixir Storage',
  inferno: 'Inferno Tower',
  bomb: 'Bomb',
  springtrap: 'Spring Trap',
  airbomb: 'Air Bomb',
  giantbomb: 'Giant Bomb',
  seekingairmine: 'Seeking Air Mine',
  skeletontrap: 'Skeleton Trap',
};

/**
 * Deliberate gaps between the source tier and this game's Town Hall 9 catalog. Each entry
 * holds the local value and why it is short of the original; every one is asserted to be
 * strictly below the source, so closing or silently widening a gap fails here.
 */
const WITHHELD: Partial<Record<BuildingKind, { count?: number; level?: number; why: string }>> = {
  // The home Clan Castle needs donations, clans and a reinforcement roster.
  clancastle: { count: 0, level: 0, why: 'home Clan Castle progression is unimplemented' },
  // Blacksmith 2 unlocks no equipment: level 10 gear needs Blacksmith 3 at Town Hall 10.
  blacksmith: { level: 1, why: 'Blacksmith levels 2+ have no implemented effect' },
  // The catalog itself ends here, so the Town Hall cannot buy its own next tier.
  townhall: { level: MAX_TOWNHALL, why: 'Town Hall 10 is the next tier of work' },
};

const sourceCounts = catalog.townHalls[MAX_TOWNHALL - 1].counts as Record<string, number>;
const sourceCeiling = (name: string) => {
  const gates = (catalog.gates as Record<string, number[]>)[name];
  return gates.filter((townhall) => townhall <= MAX_TOWNHALL).length;
};

describe('Town Hall 9 catalog', () => {
  it('is the ceiling and every tier table carries exactly nine rows', () => {
    expect(MAX_TOWNHALL).toBe(9);
    expect(BUILDINGS.townhall.maxLevel).toBe(MAX_TOWNHALL);
    for (const kind of BUILDING_KEYS) {
      expect(BUILDINGS[kind].available, kind).toHaveLength(MAX_TOWNHALL);
      expect(BUILDING_LEVELS[kind], kind).toHaveLength(MAX_TOWNHALL);
      // A tier never withdraws content that an earlier tier already permitted.
      for (let th = 1; th < MAX_TOWNHALL; th++) {
        expect(maxCountFor(kind, th + 1), kind).toBeGreaterThanOrEqual(maxCountFor(kind, th));
        expect(BUILDING_LEVELS[kind][th], kind).toBeGreaterThanOrEqual(
          BUILDING_LEVELS[kind][th - 1],
        );
      }
    }
    // Levels above the ninth tier clamp instead of reading past the table.
    expect(maxLevelFor('cannon', 12)).toBe(maxLevelFor('cannon', MAX_TOWNHALL));
    expect(maxCountFor('xbow', 12)).toBe(maxCountFor('xbow', MAX_TOWNHALL));
  });

  it('matches the pinned source counts and ceilings apart from the withheld entries', () => {
    for (const [kind, name] of Object.entries(SOURCE_NAMES) as [BuildingKind, string][]) {
      const withheld = WITHHELD[kind];
      // The Town Hall is always one of itself and is not a counted tier column.
      if (kind !== 'townhall') {
        expect(maxCountFor(kind, MAX_TOWNHALL), `${name} count`).toBe(
          withheld?.count ?? sourceCounts[name],
        );
        if (withheld?.count !== undefined)
          expect(withheld.count, `${name} count gap`).toBeLessThan(sourceCounts[name]);
      }
      expect(maxLevelFor(kind, MAX_TOWNHALL), `${name} level`).toBe(
        withheld?.level ?? sourceCeiling(name),
      );
      if (withheld?.level !== undefined)
        expect(withheld.level, `${name} level gap`).toBeLessThan(sourceCeiling(name));
    }
    // The withheld entries are the only three, and each names why.
    expect(Object.keys(WITHHELD).sort()).toEqual(['blacksmith', 'clancastle', 'townhall']);
    for (const entry of Object.values(WITHHELD)) expect(entry!.why.length).toBeGreaterThan(0);
  });

  it('reports Town Hall 9 as the requirement for everything the tier adds', () => {
    const added: [BuildingKind, number][] = [
      ['xbow', 1],
      ['xbow', 3],
      ['cannon', 11],
      ['archertower', 11],
      ['mortar', 7],
      ['airdefense', 7],
      ['wizardtower', 7],
      ['tesla', 7],
      ['bombtower', 3],
      ['airsweeper', 5],
      ['darkdrill', 4],
      ['darkdrill', 6],
      ['darkstorage', 5],
      ['darkstorage', 6],
      ['seekingairmine', 2],
      ['skeletontrap', 3],
      ['bomb', 6],
      ['airbomb', 4],
      ['springtrap', 4],
      ['wall', 9],
      ['wall', 10],
      ['camp', 7],
      ['barracks', 11],
      ['laboratory', 7],
      ['spellfactory', 4],
      ['herohall', 3],
    ];
    for (const [kind, level] of added)
      expect(requiredTownHall(kind, level), `${kind} ${level}`).toBe(MAX_TOWNHALL);
    expect(unlockTownHall('xbow')).toBe(MAX_TOWNHALL);
    // The next level of each family still reports its own later tier, or none at all.
    expect(requiredTownHall('skeletontrap', 4)).toBe(10);
    expect(requiredTownHall('bombtower', 4)).toBe(10);
    expect(requiredTownHall('airsweeper', 6)).toBe(10);
    expect(requiredTownHall('seekingairmine', 3)).toBe(10);
    expect(requiredTownHall('cannon', 12)).toBe(10);
    expect(requiredTownHall('camp', 8)).toBeNull();
    expect(requiredTownHall('spellfactory', 5)).toBeNull();
    // The Town Hall's own ceiling is the catalog maximum from the first tier onwards.
    for (let th = 1; th <= MAX_TOWNHALL; th++)
      expect(maxLevelFor('townhall', th)).toBe(MAX_TOWNHALL);
  });

  it('raises army housing, spell housing and hero levels with the tier', () => {
    expect(
      maxCountFor('camp', MAX_TOWNHALL) * campCapacity(maxLevelFor('camp', MAX_TOWNHALL)),
    ).toBe(220);
    expect(spellFactoryCapacity(maxLevelFor('spellfactory', MAX_TOWNHALL))).toBe(8);
    expect(HERO_MAX_LEVEL).toBe(30);
    expect(heroLevelCap(MAX_TOWNHALL, 3)).toBe(30);
    // A Town Hall 9 village with an older hall keeps the Town Hall 8 hero ceiling.
    expect(heroLevelCap(MAX_TOWNHALL, 2)).toBe(20);
    expect(heroLevelCap(8, 3)).toBe(20);
    expect(heroUpgradeCost(20)).toBe(17000);
    expect(heroUpgradeCost(30)).toBe(0);
  });

  it('keeps every Town Hall 9 purchase affordable within its own storage', () => {
    for (const resource of ['gold', 'elixir'] as const) {
      const kind = resource === 'gold' ? 'goldstorage' : 'elixirstorage';
      const capacity =
        100000 + maxCountFor(kind, MAX_TOWNHALL) * storageCapacity(maxLevelFor(kind, MAX_TOWNHALL));
      for (const k of BUILDING_KEYS) {
        if (BUILDINGS[k].resource !== resource || !maxCountFor(k, MAX_TOWNHALL)) continue;
        for (let level = 1; level < maxLevelFor(k, MAX_TOWNHALL); level++)
          expect(upgradeCost(k, level), `${k} ${level + 1}`).toBeLessThanOrEqual(capacity);
      }
    }
  });

  it('resolves shipped artwork for every level a Town Hall 9 village can reach', () => {
    for (const kind of BUILDING_KEYS) {
      if (!maxCountFor(kind, MAX_TOWNHALL)) continue;
      for (let level = 1; level <= maxLevelFor(kind, MAX_TOWNHALL); level++) {
        const path = asset(kind, level);
        expect(existsSync(`public${path}`), `${kind} ${level}: public${path}`).toBe(true);
      }
    }
  });
});

/** A finished Town Hall 9 village with room and funds to build. */
function village(townhall = MAX_TOWNHALL) {
  const m = new GameModel();
  m.state.obstacles = [];
  m.townhall!.level = townhall;
  m.state.gold = m.state.elixir = 50_000_000;
  m.state.dark = 200_000;
  return m;
}

describe('Town Hall 9 village', () => {
  it('unlocks the X-Bow, enforces its count and keeps its mode', () => {
    const m = village(8);
    m.beginBuild('xbow');
    expect(m.placement).toBeNull();
    m.townhall!.level = MAX_TOWNHALL;
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
    expect(restored.townhallLevel).toBe(MAX_TOWNHALL);
    expect(restored.state.buildings).toHaveLength(before);
    expect(restored.maxCount('xbow')).toBe(2);
    expect(restored.maxLevel('cannon')).toBe(11);
    expect(validateSave(restored.state)).toBe(true);
    // The Town Hall has nothing further to buy.
    restored.upgrade(restored.townhall!.id);
    expect(restored.townhall!.upgradeEnd).toBeUndefined();
  });

  it('takes the King to thirty only with a Hero Hall 3', () => {
    const m = village();
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

  it('records Town Hall 9 battles at version 45 and refuses them in earlier recordings', () => {
    const m = village();
    m.beginBuild('laboratory');
    expect(m.place(30, 30)).toBe(true);
    const lab = m.state.buildings.at(-1)!;
    m.tick(lab.upgradeEnd!);
    for (let level = 2; level <= 7; level++) {
      m.upgrade(lab.id);
      m.tick(lab.upgradeEnd!);
    }
    expect(lab.level).toBe(7);
    m.beginBuild('herohall');
    expect(m.place(36, 30)).toBe(true);
    const hall = m.state.buildings.at(-1)!;
    m.tick(hall.upgradeEnd!);
    for (const level of [2, 3]) {
      m.upgrade(hall.id);
      m.tick(hall.upgradeEnd!);
      expect(hall.level).toBe(level);
    }
    m.state.king = { level: 21 };
    m.startBattle(0, true);
    m.deploy(1, 1);
    m.step(0.05);
    m.finishBattle();
    const replay = JSON.parse(JSON.stringify(m.state.raidLog![0].replay!));
    expect(replay.version).toBe(REPLAY_VERSION);
    expect(REPLAY_VERSION).toBe(45);
    expect(replay.initial.hero).toMatchObject({ level: 21, townhall: MAX_TOWNHALL });
    expect(validateReplay(replay)).toBe(true);
    // Laboratory 7, Hero Hall 3 and King 21 could not exist in a version-44 village.
    expect(validateReplay({ ...replay, version: 44 })).toBe(false);
    const older = structuredClone(replay);
    older.version = 44;
    older.initial.hero.level = 20;
    older.initial.hero.townhall = 8;
    expect(validateReplay(older)).toBe(false);
    older.initial.buildings = older.initial.buildings.filter(
      (b: { kind: string }) => b.kind !== 'laboratory' && b.kind !== 'herohall',
    );
    expect(validateReplay(older)).toBe(true);
  });
});
