import { describe, expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import {
  JOURNEY_EPICS,
  JOURNEY_QUEST_MS,
  JOURNEY_QUEST_STARS,
  JOURNEY_TIERS,
  questChests,
  questTarget,
} from '../src/game/heroes-journey';
import { validateSave } from '../src/game/save';

function village(kingLevel = 20, townhall = 8) {
  const m = new GameModel();
  m.state.obstacles = [];
  m.state.buildings = [
    makeBuilding(1, 'townhall', 20, 20, townhall),
    makeBuilding(2, 'herohall', 4, 4, 2),
    makeBuilding(3, 'builder', 30, 30),
    makeBuilding(4, 'darkstorage', 10, 30, 2),
  ];
  m.state.nextId = 5;
  m.state.king = { level: kingLevel };
  m.state.army = emptyArmy();
  m.state.spells = emptySpells();
  return m;
}
const tierOf = (type: string, from = 0) =>
  JOURNEY_TIERS.findIndex((t, i) => i >= from && t.reward.type === type);
function grass(m: GameModel) {
  for (let x = 1.5; x < 44; x++)
    for (let y = 1.5; y < 44; y++) if (!m.deployBlocked(x, y)) return { x, y };
  throw Error('no grass');
}
const roundTrip = (m: GameModel) => validateSave(JSON.parse(JSON.stringify(m.state)));

describe("Hero's Journey track", () => {
  it('reads the wiki track in order, with every quest target and Epic item resolved', () => {
    expect(JOURNEY_TIERS).toHaveLength(113);
    expect(JOURNEY_TIERS[0]).toEqual({ level: 2, reward: { type: 'dark', amount: 3000 } });
    expect(JOURNEY_TIERS.at(-1)!.level).toBe(480);
    JOURNEY_TIERS.forEach((t, i) => {
      if (i) expect(t.level).toBeGreaterThan(JOURNEY_TIERS[i - 1].level);
      if (t.reward.type === 'quest') expect(questTarget(i)).not.toBeNull();
    });
    for (const items of Object.values(JOURNEY_EPICS))
      for (const slug of items) expect(slug).toBeTruthy();
    expect(JOURNEY_EPICS.champion).toContain('frost-charm');
    // Chests roll inside the Town Hall's range, and below Town Hall 8 use its row.
    const chest = questChests(12, 5);
    expect(chest.shiny).toBeGreaterThanOrEqual(700);
    expect(chest.shiny).toBeLessThanOrEqual(900);
    expect(questChests(7, 5)).toEqual(questChests(8, 5));
  });

  it('opens at Town Hall 7 with a Hero Hall and counts every hero level', () => {
    expect(village(20, 6).journeyOpen).toBe(false);
    const m = village(20);
    expect(m.journeyOpen).toBe(true);
    expect(m.journeyPoints).toBe(20);
    expect(m.journeyClaimable).toEqual(JOURNEY_TIERS.flatMap((t, i) => (t.level <= 20 ? [i] : [])));
  });

  it('pays resources up to storage, magic items and the next Epic item', () => {
    const m = village(60);
    m.state.dark = 0;
    expect(m.claimJourney(0)).toBe(true);
    expect(m.state.dark).toBe(3000);
    expect(m.claimJourney(0)).toBe(false);
    const potion = JOURNEY_TIERS.findIndex(
      (t) => t.reward.type === 'item' && t.reward.item === 'Hero Potion',
    );
    expect(m.claimJourney(potion)).toBe(true);
    expect(m.state.magicItems!['hero-potion']).toBe(1);
    const epic = tierOf('equipment');
    expect(JOURNEY_TIERS[epic].reward).toMatchObject({ hero: 'king', level: 1 });
    expect(m.claimJourney(epic)).toBe(true);
    expect(m.gear.levels['giant-gauntlet']).toBe(1);
    expect(roundTrip(m)).toBe(true);
  });

  it('pays Starry Ore once every Epic item of the hero is owned', () => {
    const m = village(60);
    const gear = structuredClone(m.gear);
    for (const slug of JOURNEY_EPICS.king) gear.levels[slug] = 1;
    m.state.gear = gear;
    m.state.buildings.push(makeBuilding(5, 'blacksmith', 8, 4));
    const starry = m.ores.starry;
    m.claimJourney(tierOf('equipment'));
    expect(m.ores.starry).toBe(starry + 50);
  });

  it('runs one Hero Quest at a time and lets it expire after 14 days', () => {
    const m = village(60);
    const first = tierOf('quest');
    expect(questTarget(first)).toEqual({ hero: 'king' });
    expect(m.claimJourney(first)).toBe(true);
    expect(m.journey.quest).toMatchObject({ tier: first, hero: 'king', stars: 0 });
    const second = tierOf('quest', first + 1);
    expect(m.journeyClaimable).not.toContain(second);
    expect(m.claimJourney(second)).toBe(false);
    expect(roundTrip(m)).toBe(true);
    m.tick(m.clock + JOURNEY_QUEST_MS);
    expect(m.journey.quest).toBeUndefined();
    expect(m.journeyClaimable).toContain(second);
  });

  it('counts ladder stars won with the quest hero and opens three Ore Chests', () => {
    const m = village(60);
    m.state.buildings.push(makeBuilding(5, 'blacksmith', 8, 4, 3));
    m.claimJourney(tierOf('quest'));
    m.state.journey!.quest!.stars = JOURNEY_QUEST_STARS - 1;
    const before = { ...m.ores };
    // A ladder win without the hero counts for nothing.
    m.state.army.swordsman = 5;
    m.startLadder();
    for (const v of m.battle!.buildings) m.damage(v, v.hp);
    m.finishBattle();
    expect(m.journey.quest!.stars).toBe(JOURNEY_QUEST_STARS - 1);
    m.returnHome();
    // The same win with the King deployed completes it.
    m.startLadder();
    m.activeHeroKind = 'king';
    const spot = grass(m);
    expect(m.deploy(spot.x, spot.y)).toBe(true);
    for (const v of m.battle!.buildings) m.damage(v, v.hp);
    m.finishBattle();
    expect(m.journey.quest).toBeUndefined();
    expect(m.journey.completed).toEqual([tierOf('quest')]);
    expect(m.ores.shiny).toBeGreaterThan(before.shiny);
    expect(m.ores.glowy).toBeGreaterThan(before.glowy);
    expect(m.ores.starry).toBeGreaterThan(before.starry);
    expect(roundTrip(m)).toBe(true);
  });

  it('lets an item quest count the starting item while the Epic is not owned', () => {
    const m = village(60);
    const tier = JOURNEY_TIERS.findIndex(
      (t) => t.reward.type === 'quest' && t.reward.equipment === 'Giant Gauntlet',
    );
    expect(questTarget(tier)).toEqual({ hero: 'king', item: 'giant-gauntlet' });
    m.state.journey = {
      claimed: [tier],
      quest: { tier, hero: 'king', item: 'giant-gauntlet', stars: 13, ends: m.clock + 1e9 },
    };
    expect(m.gear.levels['giant-gauntlet']).toBeUndefined();
    m.startLadder();
    m.activeHeroKind = 'king';
    const spot = grass(m);
    expect(m.deploy(spot.x, spot.y)).toBe(true);
    for (const v of m.battle!.buildings) m.damage(v, v.hp);
    m.finishBattle();
    expect(m.battle!.stars).toBeGreaterThanOrEqual(2);
    expect(m.journey.completed).toEqual([tier]);
  });

  it('finishes a hero upgrade with a Book of Heroes', () => {
    const m = village(20);
    m.state.magicItems = { 'book-of-heroes': 1 };
    expect(m.useBookOfHeroes('king')).toBe(false);
    m.state.king!.upgradeStart = m.clock;
    m.state.king!.upgradeEnd = m.clock + 86_400_000;
    expect(m.useBookOfHeroes('king')).toBe(true);
    expect(m.state.king!.level).toBe(21);
    expect(m.state.magicItems['book-of-heroes']).toBe(0);
    expect(m.useBookOfHeroes('king')).toBe(false);
  });

  it('rejects a save whose quest does not match its tier', () => {
    const m = village(60);
    m.claimJourney(tierOf('quest'));
    const bad = JSON.parse(JSON.stringify(m.state));
    bad.journey.quest.hero = 'queen';
    expect(validateSave(bad)).toBe(false);
    const items = JSON.parse(JSON.stringify(m.state));
    items.magicItems = { 'crystal-ball': 1 };
    expect(validateSave(items)).toBe(false);
  });
});
