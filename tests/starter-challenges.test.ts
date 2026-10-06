import { describe, expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { emptyArmy } from '../src/game/army';
import { validateSave } from '../src/game/save';
import {
  STARTER_CHALLENGES,
  STARTER_TIERS,
  challengeBuilding,
  challengeTroop,
  challengeUnavailable,
} from '../src/game/starter-challenges';

function village(townhall: number) {
  const m = new GameModel();
  m.state.obstacles = [];
  m.state.buildings = [
    makeBuilding(1, 'townhall', 20, 20, townhall),
    makeBuilding(2, 'builder', 30, 30),
    makeBuilding(3, 'goldstorage', 10, 10, 1),
    makeBuilding(4, 'elixirstorage', 14, 10, 1),
    makeBuilding(5, 'goldmine', 10, 14, 1),
    makeBuilding(6, 'barracks', 14, 14, 1),
    makeBuilding(7, 'camp', 24, 10, 1),
  ];
  m.state.nextId = 8;
  m.state.gold = m.state.elixir = 0;
  m.tick(m.clock);
  return m;
}
const save = (m: GameModel) => validateSave(JSON.parse(JSON.stringify(m.state)));
const challenge = (id: string) => STARTER_CHALLENGES.find((c) => c.id === id)!;
const progress = (m: GameModel, id: string) =>
  m.starterChallenges.find((c) => c.def.id === id)!.progress;

describe('Starter Challenges', () => {
  it('reads 60 challenges worth 5,600 points and 26 tiers from the client', () => {
    expect(STARTER_CHALLENGES).toHaveLength(60);
    expect(STARTER_CHALLENGES.reduce((n, c) => n + c.score, 0)).toBe(5600);
    expect(STARTER_TIERS).toHaveLength(26);
    expect(STARTER_TIERS[0]).toEqual({ score: 100, reward: { kind: 'elixir', amount: 2000 } });
    expect(STARTER_TIERS.at(-1)).toEqual({
      score: 5000,
      reward: { kind: 'item', item: 'Book of Building', amount: 1 },
    });
    // Town Hall 2 reveals 13, and every subject names a village building or troop.
    expect(STARTER_CHALLENGES.filter((c) => c.townhall === 2)).toHaveLength(13);
    for (const c of STARTER_CHALLENGES) {
      if (c.type === 'UpgradeBuilding' || c.type === 'DestroyBuilding')
        expect(challengeBuilding(c), c.id).toBeDefined();
      if (c.type === 'WinStarsUsingTroop') expect(challengeTroop(c), c.id).toBeDefined();
    }
    expect(STARTER_CHALLENGES.filter(challengeUnavailable).map((c) => c.id)).toEqual([
      'Social_JoinClan',
      'Social_RequestTroops_TH3',
      'TH4_Win_StarsPractice',
      'TH4_Home_DonateTroops',
      'TH4_Win_StarsUnderTimeLimit',
      'TH5_Home_DonateSpells',
      'TH6_Win_StarsPractice',
    ]);
  });

  it('reads building challenges from the village and reveals each Town Hall’s set', () => {
    const m = village(2);
    expect(m.starterActive).toBe(true);
    expect(m.starterChallenges.every((c) => c.def.townhall <= 2)).toBe(true);
    expect(progress(m, 'TH2_Home_UpgradeGoldStorage')).toBe(0);
    m.state.buildings.find((b) => b.kind === 'goldstorage')!.level = 2;
    expect(progress(m, 'TH2_Home_UpgradeGoldStorage')).toBe(1);
    expect(m.starterPoints).toBe(challenge('TH2_Home_UpgradeGoldStorage').score);
    // Town Hall 3 reveals its own challenges.
    m.townhall!.level = 3;
    expect(m.starterChallenges.some((c) => c.def.id === 'TH3_Home_BuildLaboratory')).toBe(true);
  });

  it('counts upgrades, research, walls, obstacles and collection as they happen', () => {
    const m = village(3);
    m.state.gold = m.state.elixir = 1_000_000;
    m.upgrade(5);
    expect(progress(m, 'TH2_UpgradeAny')).toBe(1);
    // Collection counts what reaches the storages.
    const mine = m.state.buildings.find((b) => b.id === 5)!;
    mine.upgradeEnd = undefined;
    mine.stored = 300;
    m.state.gold = 0;
    m.collect(5);
    expect(progress(m, 'TH3_Home_CollectGold')).toBe(300);
    expect(save(m)).toBe(true);
  });

  it('counts raids: campaign loot, and ladder stars, ruins and the troops that earned them', () => {
    const m = village(2);
    m.state.army = { ...emptyArmy(), archer: 20 };
    m.startBattle(0);
    for (const b of m.battle!.buildings) m.damage(b, b.hp);
    m.finishBattle();
    m.returnHome();
    // A campaign raid loots but is not a Multiplayer Battle.
    expect(progress(m, 'TH2_Battle_LootGold')).toBeGreaterThan(0);
    expect(progress(m, 'TH2_Destroy_HomeBuildings')).toBe(0);
    // A ladder match stands in for one.
    m.state.army = { ...emptyArmy(), archer: 20 };
    m.startLadder();
    m.activeTroop = 'archer';
    let placed = 0;
    for (const [x, y] of [
      [2, 24],
      [24, 2],
      [46, 24],
      [24, 46],
    ])
      while (placed < 15 && !m.deployBlocked(x, y) && m.deploy(x, y)) placed++;
    expect(placed).toBe(15);
    for (const b of m.battle!.buildings) m.damage(b, b.hp);
    m.finishBattle();
    m.returnHome();
    expect(progress(m, 'TH2_Destroy_HomeBuildings')).toBeGreaterThan(0);
    // Three stars with 15 Archers: the Archer challenge counts them.
    expect(progress(m, 'TH2_Win_StarsUsingArchers')).toBe(3);
    expect(save(m)).toBe(true);
  });

  it('claims tiers once their points are earned, never past full storages', () => {
    const m = village(2);
    m.state.starter = { counts: { TH2_Battle_LootGold: 4000 }, claimed: [] };
    expect(m.starterPoints).toBe(50);
    expect(m.starterTierIssue(0)).toBe('100 points');
    m.state.starter.counts.TH2_Destroy_HomeBuildings = 50;
    expect(m.starterPoints).toBe(175);
    expect(m.starterClaimable).toBe(1);
    const elixir = m.state.elixir;
    expect(m.claimStarterTier(0)).toBe(true);
    expect(m.state.elixir).toBe(elixir + 2000);
    expect(m.claimStarterTier(0)).toBe(false);
    expect(m.starterTierIssue(0)).toBe('Claimed');
    // A storage without room for the whole reward waits.
    m.state.starter.counts.TH2_UpgradeAny = 6;
    m.state.gold = m.resourceCap('gold') - 100;
    expect(m.starterTierIssue(1)).toBe('Storage Full');
    expect(save(m)).toBe(true);
  });

  it('grants every unclaimed tier when the Town Hall reaches 7, then ends', () => {
    const m = village(6);
    m.state.gold = m.state.elixir = 0;
    m.state.gems = 0;
    m.state.magicItems = {};
    const th = m.townhall!;
    th.upgradeStart = m.clock;
    th.upgradeEnd = m.clock + 1000;
    m.tick(m.clock + 1000);
    expect(th.level).toBe(7);
    expect(m.starterActive).toBe(false);
    expect(m.state.starter!.ended).toBe(true);
    expect(m.state.starter!.claimed).toHaveLength(26);
    // The gem tiers pay 50 in all; the magic items arrive (or sell when there is no room).
    expect(m.state.gems).toBeGreaterThanOrEqual(50);
    expect(m.magicItemCount('book-of-building')).toBe(1);
    expect(save(m)).toBe(true);
  });

  it('grants nothing to a village already past Town Hall 7, and never lowers a balance', () => {
    const m = village(8);
    expect(m.starterActive).toBe(false);
    m.state.gold = m.resourceCap('gold') + 5000;
    const gold = m.state.gold,
      th = m.townhall!;
    th.upgradeStart = m.clock;
    th.upgradeEnd = m.clock + 1000;
    m.tick(m.clock + 1000);
    expect(th.level).toBe(9);
    expect(m.state.starter).toBeUndefined();
    expect(m.state.gold).toBe(gold);
  });

  it('rejects malformed Starter Challenge saves', () => {
    const m = village(2);
    for (const starter of [
      null,
      [],
      { counts: {}, claimed: [26] },
      { counts: { Nope: 1 }, claimed: [] },
      { counts: { TH2_UpgradeAny: -1 }, claimed: [] },
      { counts: {}, claimed: [1, 1] },
    ])
      expect(validateSave({ ...m.state, starter })).toBe(false);
  });
});
