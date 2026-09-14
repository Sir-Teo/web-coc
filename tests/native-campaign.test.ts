import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { GameModel, makeBuilding, makeNpcBuilding } from '../src/game/model';
import {
  NATIVE_CAMPAIGN,
  nativeBuildings,
  nativeDefenseModes,
  nativeScenery,
  nativeCampaignIssues,
  nativeUnlocked,
  freshNativeCampaign,
  validNativeCampaign,
  NATIVE_SCENERY,
} from '../src/game/native-campaign';
import { BUILDINGS } from '../src/game/data';
import { freshCampaignLoot } from '../src/game/campaign-loot';
import { validateSave } from '../src/game/save';
import { validateReplay } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

const layouts = fs
  .readFileSync('reference/campaign/layouts.jsonl', 'utf8')
  .trim()
  .split('\n')
  .map((s) => JSON.parse(s));
const playable = NATIVE_CAMPAIGN.flatMap((_, i) => (nativeCampaignIssues(i).length ? [] : [i]));
function clear(m: GameModel) {
  m.discardRecording();
  for (const b of m.battle!.buildings) m.damage(b, b.hp);
  m.finishBattle();
}

describe('native campaign adapter and progress isolation', () => {
  it('preserves every supported village tile, level, entity and native scenery identity', () => {
    // Every native village, including all late families and armed Builder's Huts, is supported.
    expect(playable).toEqual(Array.from({ length: 90 }, (_, i) => i));
    for (const i of playable) {
      const b = nativeBuildings(i),
        original = [...layouts[i].buildings, ...layouts[i].traps];
      expect(b.length).toBe(original.length);
      for (const [j, v] of b.entries()) {
        expect([v.x, v.y, v.level]).toEqual([
          original[j].x + 2,
          original[j].y + 2,
          (original[j].lvl ?? 0) + 1,
        ]);
        expect(v.hp).toBe(v.maxHp);
        expect(v.x + BUILDINGS[v.kind].size).toBeLessThanOrEqual(48);
        expect(v.y + BUILDINGS[v.kind].size).toBeLessThanOrEqual(48);
      }
      expect(nativeScenery(i).map((o) => [o.data, o.x - 2, o.y - 2])).toEqual(
        [...layouts[i].obstacles, ...layouts[i].decos].map((o) => [o.data, o.x, o.y]),
      );
    }
    expect(nativeBuildings(0).map((b) => [b.npc, b.x, b.y, b.hp])).toEqual([
      ['goblin-townhall', 30, 20, 400],
      ['tutorial-cannon', 23, 24, 250],
    ]);
    expect(nativeBuildings(1).find((b) => b.npc === 'goblin-hut')).toMatchObject({
      x: 21,
      y: 21,
      level: 1,
      hp: 250,
    });
  });

  it('rejects missing campaign mechanics instead of replacing or omitting them', () => {
    expect(nativeCampaignIssues(37)).toEqual([]);
    expect(nativeCampaignIssues(50)).toEqual([]);
    expect(nativeCampaignIssues(53)).toEqual([]);
    expect(nativeCampaignIssues(54)).toEqual([]);
    expect(nativeCampaignIssues(55)).toEqual([]);
    expect(nativeCampaignIssues(74)).not.toContain('Garrison defenders');
    expect(nativeCampaignIssues(84)).toEqual([]);
    // An unknown entity or a level above the implemented source table still closes a village.
    const stage = NATIVE_CAMPAIGN[84],
      buildings = stage.buildings;
    try {
      for (const [placement, issue] of [
        [[1000999, 1, 1, 1], 'Building 1000999'],
        [[1000031, 1, 1, 8], 'Eagle Artillery level 8'],
      ] as const) {
        stage.buildings = [...buildings, [...placement]];
        expect(nativeCampaignIssues(84)).toContain(issue);
        expect(() => nativeBuildings(84)).toThrow();
        const m = new GameModel();
        const before = structuredClone(m.state);
        m.startCampaign(84);
        expect(m.battle).toBeNull();
        expect(m.state).toEqual(before);
      }
    } finally {
      stage.buildings = buildings;
    }
    expect(nativeCampaignIssues(84)).toEqual([]);
  });

  it('honors the two always-open tutorial villages and alternative native map paths', () => {
    expect(nativeUnlocked(0, [])).toBe(true);
    expect(nativeUnlocked(1, [])).toBe(true);
    expect(nativeUnlocked(2, [])).toBe(false);
    expect(nativeUnlocked(2, [0, 1])).toBe(true);
    const stars = Array(90).fill(0);
    stars[12] = 1;
    expect(NATIVE_CAMPAIGN[16].dependencies).toEqual([16, 13]);
    expect(nativeUnlocked(16, stars)).toBe(true);
    stars[12] = 0;
    stars[15] = 1;
    expect(nativeUnlocked(16, stars)).toBe(true);
  });

  it('starts real Payback without assigning old stars or loot to it, then settles once', () => {
    const m = new GameModel();
    m.state.stars.fill(3);
    m.state.campaignLoot = freshCampaignLoot();
    m.state.campaignLoot.remaining[0] = { gold: 0, elixir: 0 };
    const oldStars = [...m.state.stars],
      oldLoot = structuredClone(m.state.campaignLoot);
    m.state.gold = m.state.elixir = 0;
    m.startCampaign(0);
    expect(m.state.nativeCampaign).toBeUndefined();
    expect(m.battle).toMatchObject({
      catalog: 'goblin-v1',
      availableLoot: { gold: 500, elixir: 500 },
    });
    clear(m);
    expect(m.battle!.result).toEqual({
      gold: 500,
      elixir: 500,
      stars: 3,
      destruction: 100,
      trophies: 0,
    });
    expect(m.state.nativeCampaign!.stars[0]).toBe(3);
    expect(m.state.nativeCampaign!.remaining[0]).toEqual({ gold: 0, elixir: 0, dark: 0 });
    expect(m.state.stars).toEqual(oldStars);
    expect(m.state.campaignLoot).toEqual(oldLoot);
    const saved = structuredClone(m.state);
    m.finishBattle();
    expect(m.state).toEqual(saved);
    expect(validateSave(saved)).toBe(true);
    const restored = new GameModel(JSON.parse(JSON.stringify(saved)));
    restored.startCampaign(0);
    clear(restored);
    expect(restored.state.gold).toBe(500);
    expect(restored.state.elixir).toBe(500);
    expect(restored.state.raidLog![0].catalog).toBe('goblin-v1');
  });

  it('shares the 430-piece Sherbet Towers snapshot with its catalog, exact scenery and inventory', () => {
    const m = new GameModel();
    m.state.nativeCampaign = freshNativeCampaign();
    m.state.nativeCampaign.stars.fill(1);
    m.startCampaign(49);
    expect(m.battle!.buildings).toHaveLength(430);
    m.deploy(1, 1);
    m.step(0.05);
    m.finishBattle();
    const r = m.state.raidLog![0];
    expect(r.replay).toBeDefined();
    expect(validateSave(m.state)).toBe(true);
    for (const mutate of [
      (r: (typeof m.state.raidLog)[number]) => {
        r.catalog = 'valley-v1';
      },
      (r: (typeof m.state.raidLog)[number]) => {
        r.index = 0;
      },
      (r: (typeof m.state.raidLog)[number]) => {
        r.practice = true;
      },
    ]) {
      const mismatched = structuredClone(m.state);
      mutate(mismatched.raidLog[0]);
      expect(validateSave(mismatched)).toBe(false);
    }
    const exported = makeReplayFile(r.replay!);
    const data = parseReplayFile(JSON.stringify(exported));
    expect(data.initial.catalog).toBe('goblin-v1');
    expect(data.initial.scenery).toEqual(nativeScenery(49));
    expect(data.initial.buildings).toEqual(nativeBuildings(49));
    const viewer = new GameModel(),
      home = structuredClone(viewer.state);
    viewer.openReplay(data);
    viewer.seekReplay(1e6);
    for (let i = 0; i < 100 && viewer.replay!.seeking; i++) viewer.step(0.05);
    expect(viewer.battle!.result).toEqual(r.result);
    expect(viewer.state).toEqual(home);
    const malformed = structuredClone(data);
    malformed.initial.catalog = 'valley-v1';
    expect(validateReplay(malformed)).toBe(false);
  });

  it('records all supported villages without losing a large layout or outlying scenery object', () => {
    for (const index of playable) {
      const m = new GameModel();
      m.state.nativeCampaign = freshNativeCampaign();
      m.state.nativeCampaign.stars.fill(1);
      m.startCampaign(index);
      m.deploy(1, 1);
      m.finishBattle();
      expect(m.state.raidLog![0].replay, NATIVE_CAMPAIGN[index].name).toBeDefined();
      expect(validateSave(m.state), NATIVE_CAMPAIGN[index].name).toBe(true);
    }
  });

  it('keeps tutorial Cannons out of the preferred-defense class while their weapon still works', () => {
    const m = new GameModel();
    m.startCampaign(0);
    m.discardRecording();
    m.battle!.buildings = [
      makeNpcBuilding(1000, 'goblin-townhall', 10, 10),
      makeNpcBuilding(1001, 'tutorial-cannon', 20, 20),
    ];
    m.battle!.scenery = [];
    m.battle!.remaining.giant = 1;
    m.activeTroop = 'giant';
    m.deploy(7, 10);
    m.step(0.05);
    expect(m.battle!.units[0].target).toBe(1000);
  });

  it('keeps all native campaign scenery passable and applies native combat fading flags', () => {
    expect(NATIVE_SCENERY[8000000]).toMatchObject({ passable: true, faded: true });
    expect(NATIVE_SCENERY[8000009].passable).toBe(true);
    expect(NATIVE_SCENERY[18000001]).toMatchObject({ passable: true, faded: true });
    expect(Object.values(NATIVE_SCENERY).every((s) => s.passable)).toBe(true);
    const m = new GameModel();
    m.startCampaign(0);
    const tree = m.battle!.scenery!.find((o) => o.data === 8000000)!;
    m.battle!.buildings = [];
    expect(m.deployBlocked(tree.x + 1, tree.y + 1)).toBe(false);
  });

  it('validates native balances, star arrays and catalogs independently of legacy progress', () => {
    expect(validNativeCampaign(freshNativeCampaign())).toBe(true);
    for (const mutate of [
      (s: any) => {
        s.stars.pop();
      },
      (s: any) => {
        s.stars[0] = 4;
      },
      (s: any) => {
        s.remaining[0].gold = 501;
      },
      (s: any) => {
        s.remaining[0].dark = 1;
      },
      (s: any) => {
        delete s.remaining[0];
      },
      (s: any) => {
        s.catalog = 'valley-v1';
      },
    ]) {
      const value = freshNativeCampaign();
      mutate(value);
      expect(validNativeCampaign(value)).toBe(false);
    }
  });
});

it('preserves current X-Bow and Skeleton Trap modes using exact source placements', () => {
  let xbows = 0,
    airTraps = 0;
  for (const [index, layout] of layouts.entries()) {
    const { modes } = nativeDefenseModes(NATIVE_CAMPAIGN[index]);
    for (const original of [...layout.buildings, ...layout.traps]) {
      const key = `${original.data}:${original.x}:${original.y}:${(original.lvl ?? 0) + 1}`;
      if (original.data === 1000021) {
        xbows++;
        expect(original.ammo).toBe(1500);
        expect(modes.get(key)?.xbowMode ?? 'ground').toBe(original.attack_mode ? 'both' : 'ground');
      }
      if (original.data === 12000008) {
        if (original.air_mode) airTraps++;
        expect(modes.get(key)?.skeletonMode ?? 'ground').toBe(original.air_mode ? 'air' : 'ground');
      }
    }
  }
  expect(xbows).toBe(125);
  expect(airTraps).toBeGreaterThan(0);
  const stage = structuredClone(NATIVE_CAMPAIGN[50]);
  const placement = stage.buildings.find(([id]) => id === 1000021)!;
  const [data, x, y, level] = placement;
  const mode = { data, x, y, lvl: level - 1, attack_mode: true, ammo: 1500 };
  stage.activeModes = [mode, mode];
  expect([...nativeDefenseModes(stage).issues]).toContain('Unmatched or duplicate defense mode');
  stage.activeModes = [{ ...mode, x: -1 }];
  expect([...nativeDefenseModes(stage).issues]).toContain('Unmatched or duplicate defense mode');
  stage.activeModes = [{ ...mode, ammo: 1400 }];
  expect([...nativeDefenseModes(stage).issues]).toContain('Alternate defense modes');
});
