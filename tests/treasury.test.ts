import { describe, expect, it } from 'vitest';
import catalog from '../reference/leagues/catalog.json' with { type: 'json' };
import { GameModel, makeBuilding } from '../src/game/model';
import { validateSave } from '../src/game/save';
import {
  STAR_BONUS_STARS,
  TOWN_HALL_BOOST_MULTIPLIER,
  starBonusReward,
  townHallBoostHours,
  treasuryCapacity,
} from '../src/game/leagues';

const HOUR = 3600_000;

function village(townhall: number, castle = true) {
  const m = new GameModel();
  m.state.obstacles = [];
  m.state.buildings = [
    makeBuilding(1, 'townhall', 20, 20, townhall),
    makeBuilding(2, 'builder', 30, 30),
    makeBuilding(3, 'goldstorage', 10, 10, 6),
    makeBuilding(4, 'elixirstorage', 14, 10, 6),
    ...(castle ? [makeBuilding(5, 'clancastle', 10, 14, 2)] : []),
  ];
  m.state.nextId = 6;
  m.state.gold = m.state.elixir = m.state.dark = 0;
  m.state.starBonus = { stars: STAR_BONUS_STARS, readyAt: 0 };
  m.tick(m.clock);
  return m;
}
const save = (m: GameModel) => validateSave(JSON.parse(JSON.stringify(m.state)));

describe('Treasury', () => {
  it('reads its size per Town Hall from the client, matching the wiki table', () => {
    expect(catalog.treasury).toHaveLength(18);
    expect(treasuryCapacity(1)).toEqual({ gold: 50000, elixir: 50000, dark: 0 });
    expect(treasuryCapacity(6)).toEqual({ gold: 1200000, elixir: 1200000, dark: 0 });
    expect(treasuryCapacity(7)).toEqual({ gold: 1600000, elixir: 1600000, dark: 8000 });
    expect(treasuryCapacity(18)).toEqual({ gold: 6000000, elixir: 6000000, dark: 32000 });
    // Out-of-range levels clamp to the table's ends.
    expect(treasuryCapacity(0)).toEqual(treasuryCapacity(1));
    expect(treasuryCapacity(40)).toEqual(treasuryCapacity(18));
  });

  it('banks the Star Bonus in the Treasury up to its room; the rest is lost', () => {
    const m = village(2);
    const reward = starBonusReward(m.state.trophies);
    const taken = m.collectStarBonus();
    expect(taken).toBeTruthy();
    const capacity = treasuryCapacity(2);
    // Silver pays more gold than a Town Hall 2 Treasury holds, and no Dark Elixir room exists.
    expect(m.treasury).toEqual({
      gold: Math.min(reward.gold, capacity.gold),
      elixir: Math.min(reward.elixir, capacity.elixir),
      dark: 0,
    });
    expect([m.state.gold, m.state.elixir, m.state.dark]).toEqual([0, 0, 0]);
    expect(save(m)).toBe(true);
  });

  it('collects everything at once into the storages, keeping what does not fit', () => {
    const m = village(9);
    m.state.treasury = { gold: 900000, elixir: 50000, dark: 3000 };
    m.state.gold = m.resourceCap('gold') - 100000;
    const before = m.state.stats.collected ?? 0,
      dark = Math.min(3000, m.resourceCap('dark'));
    const moved = m.collectTreasury();
    // Without a Dark Elixir Storage, the Town Hall's own room decides.
    expect(moved).toEqual({ gold: 100000, elixir: 50000, dark });
    expect(m.treasury).toEqual({ gold: 800000, elixir: 0, dark: 3000 - dark });
    expect(m.state.gold).toBe(m.resourceCap('gold'));
    expect(m.state.stats.collected).toBe(before + 150000 + dark);
    // Gold collected from the Clan Castle counts toward Clan War Wealth.
    expect(m.state.achievements?.counts.war_loot).toBe(100000);
    // With the storages full, nothing moves.
    m.state.elixir = m.resourceCap('elixir');
    expect(m.collectTreasury()).toBe(false);
    expect(save(m)).toBe(true);
  });

  it('needs a Clan Castle; without one the bonus still pays into the storages', () => {
    const m = village(5, false);
    expect(m.collectTreasury()).toBe(false);
    const taken = m.collectStarBonus();
    expect(taken).toBeTruthy();
    expect(m.state.gold).toBeGreaterThan(0);
    expect(m.treasury).toEqual({ gold: 0, elixir: 0, dark: 0 });
  });

  it('multiplies the bonus after a Town Hall upgrade, for the hours the client gives', () => {
    expect([3, 4, 7, 10, 18].map(townHallBoostHours)).toEqual([0, 72, 96, 120, 120]);
    const m = village(3);
    m.state.gold = m.state.elixir = 10_000_000;
    const th = m.townhall!,
      end = m.clock + 1000;
    th.upgradeStart = m.clock;
    th.upgradeEnd = end;
    m.tick(end);
    expect(th.level).toBe(4);
    expect(m.starBonus.boostUntil).toBe(end + 72 * HOUR);
    expect(m.starBonusBoosted).toBe(true);
    const reward = starBonusReward(m.state.trophies);
    expect(m.starBonusPayout.gold).toBe(reward.gold * TOWN_HALL_BOOST_MULTIPLIER);
    expect(m.starBonusPayout.shiny).toBe(reward.shiny * TOWN_HALL_BOOST_MULTIPLIER);
    expect(save(m)).toBe(true);
    m.clock = m.starBonus.boostUntil!;
    expect(m.starBonusBoosted).toBe(false);
    expect(m.starBonusPayout).toEqual(reward);
  });

  it('rejects malformed Treasury and boost state in saves', () => {
    const m = village(8);
    for (const treasury of [
      null,
      [],
      {},
      { gold: -1, elixir: 0, dark: 0 },
      { gold: 1.5, elixir: 0, dark: 0 },
    ])
      expect(validateSave({ ...m.state, treasury })).toBe(false);
    expect(validateSave({ ...m.state, starBonus: { stars: 0, readyAt: 0, boostUntil: -5 } })).toBe(
      false,
    );
    expect(validateSave({ ...m.state, treasury: { gold: 5, elixir: 0, dark: 0 } })).toBe(true);
  });
});
