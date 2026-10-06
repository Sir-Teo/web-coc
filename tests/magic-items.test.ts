import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import catalog from '../reference/magic-items/catalog.json' with { type: 'json' };
import { GameModel, makeBuilding } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { MAGIC_ITEMS, advanceBoost, wallRings, type Boost } from '../src/game/magic-items';
import { validateSave } from '../src/game/save';

const HOUR = 3_600_000;

function village(townhall = 10) {
  const m = new GameModel();
  m.state.obstacles = [];
  m.state.buildings = [
    makeBuilding(1, 'townhall', 20, 20, townhall),
    makeBuilding(2, 'builder', 30, 30),
    makeBuilding(3, 'builder', 34, 30),
    makeBuilding(4, 'goldstorage', 10, 10, 10),
    makeBuilding(5, 'elixirstorage', 14, 10, 10),
    makeBuilding(6, 'cannon', 14, 16, 5),
    makeBuilding(7, 'laboratory', 10, 26, 8),
    makeBuilding(8, 'goldmine', 26, 10, 10),
    makeBuilding(9, 'wall', 2, 2, 11),
    makeBuilding(10, 'barracks', 26, 16, 10),
  ];
  m.state.nextId = 11;
  m.state.gold = m.state.elixir = 1000;
  m.state.dark = 0;
  m.state.gems = 0;
  m.state.army = emptyArmy();
  m.state.spells = emptySpells();
  m.state.magicItems = {};
  m.tick(m.clock);
  return m;
}
const save = (m: GameModel) => validateSave(JSON.parse(JSON.stringify(m.state)));

describe('magic items', () => {
  it('reads the client Home Village items with the wiki limits and sell prices', () => {
    const rows = Object.fromEntries(catalog.items.map((i) => [i.name, [i.max, i.gemValue]]));
    expect(rows).toEqual({
      'Book of Fighting': [1, 50],
      'Book of Building': [1, 50],
      'Book of Spells': [1, 50],
      'Book of Heroes': [1, 50],
      'Book of Everything': [1, 50],
      'Power Potion': [5, 10],
      'Resource Potion': [5, 10],
      'Rune of Gold': [1, 50],
      'Rune of Elixir': [1, 50],
      'Rune of Dark Elixir': [1, 50],
      'Wall Ring': [25, 5],
      'Builder Potion': [5, 10],
      'Hammer of Fighting': [1, 100],
      'Hammer of Building': [1, 100],
      'Hammer of Spells': [1, 100],
      'Hammer of Heroes': [1, 100],
      'Shovel of Obstacles': [5, 50],
      'Hero Potion': [5, 10],
      'Research Potion': [5, 10],
      'Super Potion': [5, 10],
      'Pet Potion': [5, 10],
    });
    expect(MAGIC_ITEMS['builder-potion'].effect).toEqual({
      boost: 'builders',
      multiplier: 10,
      seconds: 3600,
    });
    expect(MAGIC_ITEMS['research-potion'].description).toBe(
      'Boost Laboratory research to 24x its regular speed in Home Village for 1h. The Lab Assistant will not be affected.',
    );
    for (const item of catalog.items) {
      const png = readFileSync(`public/${item.icon.path}`);
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([
        item.icon.width,
        item.icon.height,
      ]);
    }
  });

  it('keeps what fits, sells the rest for gems and cashes items in', () => {
    const m = village();
    expect(m.addMagicItem('book-of-heroes', 2)).toBe(1);
    expect(m.magicItemCount('book-of-heroes')).toBe(1);
    expect(m.state.gems).toBe(50);
    expect(m.addMagicItem('wall-ring', 30)).toBe(5);
    expect(m.state.gems).toBe(75);
    expect(m.sellMagicItem('wall-ring')).toBe(true);
    expect([m.magicItemCount('wall-ring'), m.state.gems]).toEqual([24, 80]);
    expect(save(m)).toBe(true);
  });

  it('fills storages with a Rune, but not full ones or ones the village lacks', () => {
    // Below Town Hall 7 nothing stores Dark Elixir.
    const m = village(6);
    m.addMagicItem('rune-of-gold');
    m.addMagicItem('rune-of-dark-elixir');
    const cap = m.resourceCap('gold');
    expect(m.resourceCap('dark')).toBe(0);
    expect(m.useRune('rune-of-dark-elixir')).toBe(false);
    expect(m.useRune('rune-of-gold')).toBe(true);
    expect(m.state.gold).toBe(cap);
    m.addMagicItem('rune-of-gold');
    expect(m.useRune('rune-of-gold')).toBe(false);
    expect(m.magicItemCount('rune-of-gold')).toBe(1);
  });

  it('finishes running upgrades with the matching Book, Everything only standing in', () => {
    const m = village();
    m.state.gold = m.state.elixir = 10_000_000;
    m.upgrade(6);
    m.research('archer');
    const cannon = m.state.buildings.find((b) => b.id === 6)!;
    expect(m.booksFor({ building: 6 })).toEqual([]);
    m.addMagicItem('book-of-everything');
    m.addMagicItem('book-of-building');
    m.addMagicItem('book-of-spells');
    // Two books could finish the Cannon: the Book of Building goes first.
    expect(m.booksFor({ building: 6 })).toEqual(['book-of-building']);
    expect(m.useBook('book-of-everything', { building: 6 })).toBe(false);
    expect(m.useBook('book-of-building', { building: 6 })).toBe(true);
    expect([cannon.level, cannon.upgradeEnd]).toEqual([6, undefined]);
    // Troop research: the Book of Spells cannot, so Everything stands in.
    expect(m.booksFor({ research: true })).toEqual(['book-of-everything']);
    expect(m.useBook('book-of-spells', { research: true })).toBe(false);
    expect(m.useBook('book-of-everything', { research: true })).toBe(true);
    expect(m.troopLevel('archer')).toBe(2);
    expect(m.state.research).toBeUndefined();
    expect(m.magicItemCount('book-of-spells')).toBe(1);
  });

  it('upgrades instantly and free with a Hammer, keeping every other rule', () => {
    const m = village();
    m.addMagicItem('hammer-of-building');
    m.addMagicItem('hammer-of-fighting');
    const before = [m.state.gold, m.state.elixir, m.state.dark];
    // Walls take rings, never hammers.
    expect(m.useHammer('hammer-of-building', { building: 9 })).toBe(false);
    // Both builders busy: the Hammer waits, unspent.
    for (const id of [4, 5]) {
      const b = m.state.buildings.find((v) => v.id === id)!;
      b.upgradeStart = m.clock;
      b.upgradeEnd = m.clock + HOUR;
    }
    expect(m.useHammer('hammer-of-building', { building: 6 })).toBe(false);
    expect(m.magicItemCount('hammer-of-building')).toBe(1);
    m.state.buildings.find((v) => v.id === 4)!.upgradeEnd = undefined;
    expect(m.useHammer('hammer-of-building', { building: 6 })).toBe(true);
    expect(m.state.buildings.find((v) => v.id === 6)).toMatchObject({ level: 6 });
    expect(m.state.buildings.find((v) => v.id === 6)!.upgradeEnd).toBeUndefined();
    expect([m.state.gold, m.state.elixir, m.state.dark]).toEqual(before);
    expect(m.magicItemCount('hammer-of-building')).toBe(0);
    // A troop while the lab researches another, but not the troop under research.
    m.state.research = { kind: 'giant', end: m.clock + HOUR };
    expect(m.useHammer('hammer-of-fighting', { research: 'giant' })).toBe(false);
    expect(m.useHammer('hammer-of-spells', { research: 'archer' })).toBe(false);
    expect(m.useHammer('hammer-of-fighting', { research: 'archer' })).toBe(true);
    expect(m.troopLevel('archer')).toBe(2);
    expect(m.state.research?.kind).toBe('giant');
    expect([m.state.gold, m.state.elixir, m.state.dark]).toEqual(before);
    expect(save(m)).toBe(true);
  });

  it('takes one Wall Ring per million of a wall level’s cost, with a free builder', () => {
    expect([1000, 1_000_000, 1_500_000, 2_000_000, 7_000_000].map(wallRings)).toEqual([
      1, 1, 2, 2, 7,
    ]);
    const m = village(12);
    const wall = m.state.buildings.find((b) => b.kind === 'wall')!;
    // Level 11 to 12 costs 1,000,000: one ring.
    expect(m.wallRingsFor(wall.id)).toBe(1);
    m.addMagicItem('wall-ring', 2);
    expect(m.useWallRing(wall.id)).toBe(true);
    expect([wall.level, m.magicItemCount('wall-ring'), m.state.gold]).toEqual([12, 1, 1000]);
    // Level 12 to 13 costs 1,500,000: two rings, and one is not enough.
    expect(m.wallRingsFor(wall.id)).toBe(2);
    expect(m.useWallRing(wall.id)).toBe(false);
    expect(wall.level).toBe(12);
  });

  it('runs a Builder Potion at ten times speed for an hour, offline included', () => {
    const m = village();
    m.state.gold = m.state.elixir = 10_000_000;
    const cannon = m.state.buildings.find((b) => b.id === 6)!;
    const mine = m.state.buildings.find((b) => b.id === 8)!;
    m.upgrade(cannon.id);
    cannon.upgradeEnd = m.clock + 20 * HOUR;
    mine.upgradeStart = m.clock;
    mine.upgradeEnd = m.clock + 5 * HOUR;
    m.addMagicItem('builder-potion', 2);
    const start = m.clock;
    expect(m.usePotion('builder-potion')).toBe(true);
    m.tick(start + 2 * HOUR);
    // Ten hours of work in the hour: 9 saved on the Cannon, the mine done at 30 minutes.
    expect(cannon.upgradeEnd).toBe(start + 11 * HOUR);
    expect(mine.upgradeEnd).toBeUndefined();
    expect(m.state.boosts?.builders).toBeUndefined();
    // A second potion while one runs extends it.
    m.usePotion('builder-potion');
    expect(m.boostLeft('builders')).toBe(3600);
    expect(save(m)).toBe(true);
  });

  it('extends a running potion instead of stacking it', () => {
    const m = village();
    m.addMagicItem('research-potion', 2);
    m.usePotion('research-potion');
    m.usePotion('research-potion');
    expect(m.boostLeft('laboratory')).toBe(7200);
    // Research at 24×: a 48-hour research done in two hours.
    m.state.research = { kind: 'archer', end: m.clock + 48 * HOUR };
    m.tick(m.clock + 2 * HOUR);
    expect(m.state.research).toBeUndefined();
    expect(m.troopLevel('archer')).toBe(2);
  });

  it('doubles collector production for the day a Resource Potion runs', () => {
    const plain = village(),
      boosted = village();
    boosted.addMagicItem('resource-potion');
    boosted.usePotion('resource-potion');
    const mine = (m: GameModel) => m.state.buildings.find((b) => b.id === 8)!;
    plain.tick(plain.clock + HOUR / 4);
    boosted.tick(boosted.clock + HOUR / 4);
    expect(mine(boosted).stored).toBeCloseTo(mine(plain).stored * 2, 3);
  });

  it('moves a timer no further than the moment its work is done', () => {
    const boost: Boost = { start: 0, end: HOUR, applied: 0 };
    const t = {
      end: 5 * HOUR,
      move(ms: number) {
        t.end -= ms;
      },
    };
    expect(advanceBoost(boost, 10, [t], 2 * HOUR)).toBe(true);
    expect(t.end).toBe(HOUR / 2);
    expect(boost.applied).toBe(HOUR);
    expect(advanceBoost(boost, 10, [t], 3 * HOUR)).toBe(false);
  });

  it('rejects malformed items and boosts in saves', () => {
    const m = village();
    m.state.boosts = { builders: { start: 10, end: 5, applied: 10 } };
    expect(save(m)).toBe(false);
    m.state.boosts = { sauna: { start: 1, end: 5, applied: 1 } } as never;
    expect(save(m)).toBe(false);
    m.state.boosts = {};
    m.state.magicItems = { 'training-potion': 1 };
    expect(save(m)).toBe(false);
  });
});
