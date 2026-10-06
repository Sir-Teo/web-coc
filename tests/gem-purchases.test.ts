import { describe, expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { BUILDINGS, gemCost } from '../src/game/data';
import {
  GEM_TEXTS,
  TREASURE_PACKS,
  packAmount,
  resourceGems,
  timeGems,
} from '../src/game/gem-costs';
import { validateSave } from '../src/game/save';

const save = (m: GameModel) => validateSave(JSON.parse(JSON.stringify(m.state)));
/** The starter village at Town Hall 5: room for a third Cannon and higher walls. */
function village() {
  const m = new GameModel();
  m.townhall!.level = 5;
  m.state.gems = 500;
  return m;
}

describe('gem prices', () => {
  it('price time from the client’s speed-up points, joined by straight lines', () => {
    expect(gemCost).toBe(timeGems);
    expect([0, 30, 60, 3600, 86400, 604800].map(timeGems)).toEqual([1, 1, 1, 20, 260, 1000]);
    // Four hours: 20 + 10,800 × 240 / 82,800 = 51.3.
    expect(timeGems(4 * 3600)).toBe(51);
    // Two days: 260 + 86,400 × 740 / 518,400 = 383.3; past a week the last line continues.
    expect(timeGems(2 * 86400)).toBe(383);
    expect(timeGems(14 * 86400)).toBe(1863);
  });

  it('price Gold, Elixir and Dark Elixir from the client’s resource points', () => {
    expect(resourceGems('gold', 0)).toBe(0);
    expect(resourceGems('gold', 50)).toBe(1);
    expect(resourceGems('elixir', 1000)).toBe(5);
    // 500: 1 + 400 × 4 / 900 = 2.8.
    expect(resourceGems('gold', 500)).toBe(3);
    expect(resourceGems('elixir', 25_000)).toBe(33);
    expect(resourceGems('gold', 10_000_000)).toBe(2000);
    expect(resourceGems('dark', 1)).toBe(1);
    // 50: 5 + 40 × 15 / 90 = 11.7.
    expect(resourceGems('dark', 50)).toBe(12);
    expect(resourceGems('dark', 100_000)).toBe(2000);
    expect(GEM_TEXTS.header).toBe('You need more <resource>');
    expect(GEM_TEXTS.text).toBe('Buy the missing <count> <resource>?');
  });
});

describe('buying missing resources', () => {
  it('offers the missing amount of a refused upgrade, then buys it and starts the upgrade', () => {
    const m = village(),
      mine = m.state.buildings.find((b) => b.kind === 'goldmine')!,
      cost = m.upgradeCost(mine),
      resource = BUILDINGS[mine.kind].resource as 'gold' | 'elixir';
    m.state[resource] = cost - 1000;
    m.upgrade(mine.id);
    expect(mine.upgradeEnd).toBeUndefined();
    expect(m.shortfallOffer).toEqual({ resource, cost, missing: 1000, gems: 5 });
    expect(m.buyShortfall()).toBe(true);
    expect(m.shortfall).toBeNull();
    expect(m.state.gems).toBe(495);
    expect(m.state[resource]).toBe(0);
    expect(mine.upgradeEnd).toBeGreaterThan(m.clock);
    expect(save(m)).toBe(true);
  });

  it('prices the offer when it is taken and keeps gems when they fall short or it is declined', () => {
    const m = village(),
      cannon = m.state.buildings.find((b) => b.kind === 'cannon')!;
    m.state.gold = 0;
    m.upgrade(cannon.id);
    const first = m.shortfallOffer!;
    expect(first.missing).toBe(first.cost);
    // Gold collected meanwhile lowers the price.
    m.state.gold = first.cost - 100;
    expect(m.shortfallOffer).toMatchObject({ missing: 100, gems: 1 });
    m.dismissShortfall();
    expect(m.shortfall).toBeNull();
    expect(cannon.upgradeEnd).toBeUndefined();
    // Too few gems: nothing is bought.
    m.state.gold = 0;
    m.state.gems = 0;
    m.upgrade(cannon.id);
    expect(m.buyShortfall()).toBe(false);
    expect(m.state.gold).toBe(0);
    expect(cannon.upgradeEnd).toBeUndefined();
  });

  it('offers nothing past the storages, for gem prices, from a Shop drag or in battle', () => {
    const m = village(),
      th = m.townhall!;
    m.state.gold = 0;
    // A price above the storages cannot be completed.
    const cap = m.resourceCap('gold');
    const cost = m.upgradeCost(th);
    if (cost > cap) {
      m.upgrade(th.id);
      expect(m.shortfall).toBeNull();
    }
    m.state.gems = 0;
    m.beginDecoration('bk-statue');
    expect(m.shortfall).toBeNull();
    m.state.elixir = 0;
    m.beginBuild('cannon', false);
    expect(m.shortfall).toBeNull();
    m.beginBuild('cannon');
    expect(m.shortfall).toMatchObject({ resource: 'gold' });
  });

  it('buys a Shop building’s price and puts it in hand', () => {
    const m = village();
    m.state.gold = 0;
    m.beginBuild('cannon');
    const offer = m.shortfallOffer!;
    expect(offer.resource).toBe('gold');
    expect(m.buyShortfall()).toBe(true);
    expect(m.placement).toBe('cannon');
    expect(m.state.gold).toBe(offer.cost);
  });

  it('offers walls their missing gold and upgrades the selection', () => {
    const m = village(),
      wall = m.state.buildings.find((b) => b.kind === 'wall')!;
    m.state.gold = 0;
    const quote = m.wallUpgradeQuote([wall.id], 'gold');
    expect(quote.short).toBe(true);
    m.upgradeWalls([wall.id], 'gold');
    expect(m.shortfallOffer?.missing).toBe(quote.cost);
    const level = wall.level;
    m.buyShortfall();
    expect(wall.level).toBe(level + 1);
  });
});

describe('Treasure packs', () => {
  it('reads three packs a resource from the client, named and pictured', () => {
    expect(TREASURE_PACKS.map((p) => `${p.resource}-${p.share}`)).toEqual([
      'gold-10',
      'gold-50',
      'gold-100',
      'elixir-10',
      'elixir-50',
      'elixir-100',
      'dark-10',
      'dark-50',
      'dark-100',
    ]);
    expect(TREASURE_PACKS[0].name).toBe('Fill Storages by 10%');
    expect(TREASURE_PACKS[1].name).toBe('Fill Storages by Half');
    expect(TREASURE_PACKS[8].name).toBe('Fill Dark Elixir Storages');
    for (const p of TREASURE_PACKS) expect(p.art.width).toBeLessThanOrEqual(160);
  });

  it('add a share of the storages only while it fits, and the full pack whatever room is left', () => {
    expect(packAmount(10, 0, 7000)).toBe(700);
    expect(packAmount(50, 3500, 7000)).toBe(3500);
    // Over 90% full: no room for a tenth; over half full: none for half.
    expect(packAmount(10, 6301, 7000)).toBe(0);
    expect(packAmount(50, 3501, 7000)).toBe(0);
    expect(packAmount(100, 6999, 7000)).toBe(1);
    expect(packAmount(100, 7000, 7000)).toBe(0);
    expect(packAmount(100, 8000, 7000)).toBe(0);
  });

  it('are bought with gems at the client’s prices', () => {
    const m = village();
    m.state.gold = 0;
    const cap = m.resourceCap('gold');
    const pack = m.resourcePack('gold', 100);
    expect(pack).toEqual({ amount: cap, gems: resourceGems('gold', cap), issue: null });
    expect(m.buyResourcePack('gold', 100)).toBe(true);
    expect(m.state.gold).toBe(cap);
    expect(m.state.gems).toBe(500 - pack.gems);
    expect(m.resourcePack('gold', 10).issue).toBe('Not enough storage space!');
    expect(m.buyResourcePack('gold', 10)).toBe(false);
    m.state.gems = 0;
    m.state.elixir = 0;
    expect(m.resourcePack('elixir', 10).issue).toBe('Not enough Gems');
    expect(m.buyResourcePack('elixir', 10)).toBe(false);
    expect(m.state.elixir).toBe(0);
    expect(save(m)).toBe(true);
  });
});
