import { describe, it, expect } from 'vitest';
import catalog from '../reference/achievements/catalog.json' with { type: 'json' };
import { fundedVillage } from './fixtures/funded-village';
import { GameModel } from '../src/game/model';
import { validateSave } from '../src/game/save';
import {
  ACHIEVEMENTS,
  UNAVAILABLE_ACHIEVEMENTS,
  achievementById,
  destroyCounts,
  validAchievements,
} from '../src/game/achievements';

const entry = (m: GameModel, id: string) => m.achievements.find((a) => a.def.id === id)!;

describe('achievements', () => {
  it('reads the client rows: tiers, targets and prizes', () => {
    expect(catalog.achievements).toHaveLength(51);
    expect(ACHIEVEMENTS).toHaveLength(36);
    expect(UNAVAILABLE_ACHIEVEMENTS).toHaveLength(15);
    expect(achievementById('town_hall')!.tiers.map((t) => [t.count, t.xp, t.gems])).toEqual([
      [3, 10, 5],
      [5, 100, 10],
      [8, 1000, 20],
    ]);
    expect(achievementById('town_hall')!.tiers[0].info).toBe('Upgrade Town Hall to level 3');
    // Clans, wars and accounts are out of reach offline.
    for (const id of ['donate_units', 'war_stars', 'pvp_defenses', 'clan_games_points'])
      expect(achievementById(id)).toBeUndefined();
  });

  it('pays each finished tier once, in order, and keeps claims in the save', () => {
    const m = fundedVillage();
    const th = m.state.buildings.find((b) => b.kind === 'townhall')!;
    th.level = 2;
    expect(entry(m, 'town_hall').ready).toBe(false);
    expect(m.claimAchievement('town_hall')).toBe(false);
    th.level = 3;
    const gems = m.state.gems,
      xp = m.state.xp;
    expect(entry(m, 'town_hall').ready).toBe(true);
    expect(m.claimAchievement('town_hall')).toBe(true);
    expect(m.state.gems).toBe(gems + 5);
    expect(m.state.xp).toBe(xp + 10);
    expect(m.claimAchievement('town_hall')).toBe(false);
    expect(entry(m, 'town_hall')).toMatchObject({ claimed: 1, ready: false });
    expect(entry(m, 'town_hall').next!.count).toBe(5);
    const restored = new GameModel(structuredClone(m.state));
    expect(validateSave(restored.state)).toBe(true);
    expect(entry(restored, 'town_hall').claimed).toBe(1);
    expect(restored.claimAchievement('town_hall')).toBe(false);
  });

  it('counts trophies held toward Sweet Victory', () => {
    const m = new GameModel();
    m.state.trophies = 1248;
    expect(entry(m, 'victory_points').value).toBe(1248);
    expect(m.claimAchievement('victory_points')).toBe(true);
    expect(m.claimAchievement('victory_points')).toBe(true);
    expect(m.claimAchievement('victory_points')).toBe(false);
  });

  it('counts each obstacle cleared', () => {
    const m = fundedVillage();
    const o = m.obstacles[0];
    expect(m.removeObstacle(o.id)).toBe(true);
    m.tick(o.removeEnd!);
    expect(entry(m, 'clear_obstacles').value).toBe(1);
  });

  it('counts loot taken in campaign raids but not in practice', () => {
    for (const practice of [false, true]) {
      const m = fundedVillage();
      m.startBattle(0, practice);
      const b = m.battle!;
      for (const v of b.buildings) v.hp = 0;
      m.finishBattle();
      const taken = b.lootTaken ?? { gold: 0, elixir: 0 };
      if (!practice) expect(taken.gold).toBeGreaterThan(0);
      expect(entry(m, 'loot_gold').value).toBe(practice ? 0 : taken.gold);
      expect(entry(m, 'loot_elixir').value).toBe(practice ? 0 : taken.elixir);
    }
  });

  it('counts ladder wins and the buildings they destroy, as multiplayer battles', () => {
    const m = fundedVillage();
    m.startLadder();
    const b = m.battle!;
    expect(b.ladder).toBeDefined();
    const walls = b.buildings.filter((v) => v.kind === 'wall');
    for (const v of walls) v.hp = 0;
    const hall = b.buildings.find((v) => v.kind === 'townhall')!;
    hall.hp = 0;
    b.stars = 1;
    m.finishBattle();
    expect(entry(m, 'destroy_walls').value).toBe(walls.length);
    expect(entry(m, 'destroy_townhall').value).toBe(1);
    expect(entry(m, 'pvp_attacks').value).toBe(1);
    // A campaign raid is not a multiplayer battle.
    m.returnHome();
    m.startBattle(0);
    for (const v of m.battle!.buildings) v.hp = 0;
    m.finishBattle();
    expect(entry(m, 'destroy_townhall').value).toBe(1);
  });

  it('matches weaponized and merged buildings to their achievements', () => {
    const th12 = achievementById('destroy_weaponised_th')!;
    const artillery = achievementById('destroy_artillery')!;
    expect(destroyCounts(th12, { kind: 'townhall', level: 11 })).toBe(false);
    expect(destroyCounts(th12, { kind: 'townhall', level: 12 })).toBe(true);
    expect(
      destroyCounts(achievementById('destroy_townhall')!, { kind: 'townhall', level: 1 }),
    ).toBe(true);
    expect(destroyCounts(artillery, { kind: 'eagleartillery', level: 1 })).toBe(true);
    expect(destroyCounts(artillery, { kind: 'townhall', level: 17 })).toBe(true);
    expect(destroyCounts(artillery, { kind: 'townhall', level: 16 })).toBe(false);
  });

  it('rejects malformed achievement saves', () => {
    expect(validAchievements({ counts: {}, claimed: {} })).toBe(true);
    expect(validAchievements({ counts: { town_hall: 1 }, claimed: { town_hall: 3 } })).toBe(true);
    expect(validAchievements({ counts: {}, claimed: { town_hall: 4 } })).toBe(false);
    expect(validAchievements({ counts: { nope: 1 }, claimed: {} })).toBe(false);
    expect(validAchievements({ counts: { loot_gold: -1 }, claimed: {} })).toBe(false);
    expect(validAchievements({ counts: [], claimed: {} })).toBe(false);
    const m = new GameModel();
    m.state.achievements = { counts: {}, claimed: { war_stars: 1 } };
    expect(validateSave(m.state)).toBe(false);
  });
});
