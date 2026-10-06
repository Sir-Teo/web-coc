import { describe, expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { validateSave } from '../src/game/save';
import {
  FREE_OFFER,
  TRADER_OFFERS,
  WEEKLY_DEALS,
  traderWeek,
  traderWeekEnds,
  weeklyDeals,
} from '../src/game/trader';

function village(townhall: number) {
  const m = new GameModel();
  m.state.obstacles = [];
  m.state.buildings = [
    makeBuilding(1, 'townhall', 20, 20, townhall),
    makeBuilding(2, 'builder', 30, 30),
    makeBuilding(3, 'blacksmith', 10, 10, 1),
  ];
  m.state.nextId = 4;
  m.state.army = emptyArmy();
  m.state.spells = emptySpells();
  m.state.magicItems = {};
  m.state.gems = 5000;
  // A Tuesday morning, an hour after the deals changed.
  m.clock = Date.UTC(2026, 9, 6, 9);
  m.tick(m.clock);
  return m;
}
const save = (m: GameModel) => validateSave(JSON.parse(JSON.stringify(m.state)));

describe('Trader', () => {
  it('changes deals every Tuesday at 08:00 UTC, the free Glowy Ore first', () => {
    const tuesday = Date.UTC(2026, 9, 6, 8);
    expect(traderWeek(tuesday)).toBe(traderWeek(tuesday - 1) + 1);
    expect(traderWeekEnds(tuesday)).toBe(tuesday + 7 * 24 * 3600_000);
    const deals = weeklyDeals(traderWeek(tuesday));
    expect(deals).toHaveLength(1 + WEEKLY_DEALS);
    expect(deals[0]).toBe(FREE_OFFER);
    expect(new Set(deals.map((d) => d.id)).size).toBe(deals.length);
    // The same week always shows the same deals; over a season every deal appears.
    expect(weeklyDeals(traderWeek(tuesday))).toEqual(deals);
    const seen = new Set<string>();
    for (let w = 0; w < 26; w++)
      for (const d of weeklyDeals(traderWeek(tuesday) + w)) seen.add(d.id);
    expect(seen.size).toBe(TRADER_OFFERS.length + 1);
  });

  it('opens at Town Hall 6 and sells for Gems from Town Hall 8', () => {
    expect(village(5).traderIssue(FREE_OFFER)).toBe('Trader arrives at Town Hall Level 6');
    expect(village(7).traderIssue(FREE_OFFER)).toBe('Gem Offers unlock at Town Hall Level 8');
    expect(village(8).traderIssue(FREE_OFFER)).toBeNull();
  });

  it('sells each deal its weekly quantity, refusing items that will not fit', () => {
    const m = village(10);
    const potion = TRADER_OFFERS.find((d) => d.id === 'research-potion')!;
    const book = TRADER_OFFERS.find((d) => d.id === 'book-of-fighting')!;
    // Buy whatever this week offers by forcing these deals into it.
    Object.defineProperty(m, 'traderDeals', { get: () => [FREE_OFFER, potion, book] });
    for (let i = 0; i < 3; i++) expect(m.buyDeal('research-potion')).toBe(true);
    expect(m.traderIssue(potion)).toBe('Out of stock');
    expect(m.buyDeal('research-potion')).toBe(false);
    expect([m.magicItemCount('research-potion'), m.state.gems]).toEqual([3, 5000 - 360]);
    m.addMagicItem('book-of-fighting');
    expect(m.traderIssue(book)).toBe('Storage Full');
    const glowy = m.ores.glowy;
    expect(m.buyDeal('free-glowy-ore')).toBe(true);
    expect(m.ores.glowy).toBe(glowy + 10);
    expect(m.state.gems).toBe(5000 - 360);
    expect(save(m)).toBe(true);
    // A new week restocks every deal.
    m.clock += 7 * 24 * 3600_000;
    expect(m.traderBought('research-potion')).toBe(0);
    expect(m.traderIssue(potion)).toBeNull();
  });

  it('refuses a deal it cannot pay for and rejects malformed purchases in saves', () => {
    const m = village(10);
    const deal = m.traderDeals.find((d) => d.gems > 0)!;
    m.state.gems = deal.gems - 1;
    expect(m.traderIssue(deal)).toBe('Not enough gems');
    m.state.trader = { week: 1, bought: { 'research-potion': 4 } };
    expect(save(m)).toBe(false);
    m.state.trader = { week: 1, bought: { 'training-potion': 1 } };
    expect(save(m)).toBe(false);
    m.state.trader = { week: 1, bought: { 'research-potion': 3 } };
    expect(save(m)).toBe(true);
  });
});
