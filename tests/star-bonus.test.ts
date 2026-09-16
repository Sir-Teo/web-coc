import { describe, expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { validateSave } from '../src/game/save';
import {
  LEAGUES,
  leagueFor,
  STAR_BONUS_COOLDOWN,
  STAR_BONUS_STARS,
  starBonusReward,
} from '../src/game/leagues';
import { ORE_KEYS, oreCapacity } from '../src/game/equipment';

describe('league Star Bonus', () => {
  it('bands every trophy count without a gap and pays each league its own reward', () => {
    expect(LEAGUES).toHaveLength(23);
    expect(LEAGUES[0].trophies).toBe(0);
    for (const [index, league] of LEAGUES.entries()) {
      expect(league.trophies, league.name).toBe(index ? LEAGUES[index - 1].until + 1 : 0);
      expect(leagueFor(league.trophies).name).toBe(league.name);
      expect(leagueFor(league.until).name).toBe(league.name);
    }
    // A starting village sits in Silver1, whose bonus is where its first ore comes from.
    expect(leagueFor(1248).name).toBe('Silver1');
    expect(starBonusReward(1248)).toEqual({
      gold: 350000,
      elixir: 350000,
      dark: 1500,
      shiny: 275,
      glowy: 11,
      starry: 0,
    });
    // Unranked pays no ore at all, and the last league is open-ended.
    expect(starBonusReward(0).shiny).toBe(0);
    expect(leagueFor(9_999_999).name).toBe('Legendary');
    expect(starBonusReward(9_999_999).shiny).toBe(1000);
  });

  it('banks stars from attacks, pays once the price is met and then waits a day', () => {
    const m = new GameModel();
    m.townhall!.level = 8;
    expect(m.starBonus.stars).toBe(0);
    expect(m.starBonusReady).toBe(false);
    expect(m.collectStarBonus()).toBe(false);

    // Three campaign clears bank nine stars; the original lets them overflow past five.
    for (let stage = 0; stage < 3; stage++) {
      m.startBattle(stage);
      for (const b of m.battle!.buildings) m.damage(b, b.hp);
      m.finishBattle();
      m.returnHome();
    }
    expect(m.starBonus.stars).toBeGreaterThanOrEqual(STAR_BONUS_STARS);
    const banked = m.starBonus.stars;
    expect(m.starBonusReady).toBe(true);

    m.state.gold = m.state.elixir = m.state.dark = 0;
    m.state.ores = { shiny: 0, glowy: 0, starry: 0 };
    const reward = starBonusReward(m.state.trophies);
    const taken = m.collectStarBonus();
    expect(taken).toBeTruthy();
    for (const k of ORE_KEYS) expect(m.ores[k], k).toBe(reward[k]);
    expect(m.state.dark).toBe(Math.min(reward.dark, m.resourceCap('dark')));
    expect(m.starBonus.stars).toBe(banked - STAR_BONUS_STARS);
    expect(m.starBonus.readyAt).toBe(m.clock + STAR_BONUS_COOLDOWN);
    expect(validateSave(m.state)).toBe(true);

    // A second collection waits out the cooldown even with stars still banked.
    m.state.starBonus!.stars = STAR_BONUS_STARS;
    expect(m.starBonusReady).toBe(false);
    expect(m.collectStarBonus()).toBe(false);
    m.tick(m.starBonus.readyAt);
    expect(m.starBonusReady).toBe(true);
  });

  it('never banks ore past what the forge holds, and rejects malformed bonus state', () => {
    const m = new GameModel();
    m.townhall!.level = 8;
    const capacity = oreCapacity(1);
    m.state.ores = { ...capacity };
    m.state.starBonus = { stars: STAR_BONUS_STARS, readyAt: 0 };
    m.collectStarBonus();
    for (const k of ORE_KEYS) expect(m.ores[k], k).toBe(capacity[k]);
    for (const bonus of [null, [], {}, { stars: -1, readyAt: 0 }, { stars: 1.5, readyAt: 0 }])
      expect(validateSave({ ...m.state, starBonus: bonus })).toBe(false);
  });
});
