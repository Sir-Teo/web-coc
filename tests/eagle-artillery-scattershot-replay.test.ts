import { describe, expect, it } from 'vitest';
import { GameModel, makeBuilding, type Battle } from '../src/game/model';
import { emptyArmy } from '../src/game/army';
import { TROOP_KEYS, maxTroopLevel } from '../src/game/data';
import { REPLAY_VERSION, replayBattle, validateReplay, type ReplayData } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { lateCampaignIssues } from '../src/game/late-campaign';
import {
  NATIVE_CAMPAIGN,
  freshNativeCampaign,
  nativeCampaignIssues,
  nativeLayout,
} from '../src/game/native-campaign';
import { eagleArtilleryDeployedHousing } from '../src/game/eagle-artillery-stats';
import { developedSave } from './fixtures/developed-village';
import {
  applyDeployments,
  lateSetup,
  liveBattle,
  replayData,
  troopLine,
  type Deployment,
} from './fixtures/late-eagle-scattershot-battle';

type Observed = { awake: number; shells: number; pushes: number; throws: number; shards: number };
function observe(battle: Battle, seen: Observed) {
  const ea = battle.late?.eagleArtillery,
    ss = battle.late?.scattershot;
  if (ea) {
    seen.awake = Math.max(
      seen.awake,
      Object.values(ea.towers).filter((t) => t.awakeAt !== undefined).length,
    );
    seen.shells = Math.max(
      seen.shells,
      Object.values(ea.towers).reduce((n, t) => n + t.fired, 0),
    );
  }
  if (battle.units.some((u) => u.late?.eagleArtillery?.push)) seen.pushes++;
  if (ss) {
    seen.throws = Math.max(
      seen.throws,
      Object.values(ss.towers).reduce((n, t) => n + t.fired, 0),
    );
    seen.shards = Math.max(seen.shards, ...ss.impacts.map((i) => i.shardHits), 0);
  }
}
/** Seek a portable recording backward through every snapshot and forward to its end. */
function verifyPlayback(data: ReplayData, snapshots: Map<number, string>, final: Battle) {
  const record = parseReplayFile(JSON.stringify(makeReplayFile(data)));
  expect(record.version).toBe(44);
  const viewer = new GameModel();
  const home = JSON.stringify(viewer.state);
  expect(viewer.openReplay(record)).toBe(true);
  const seek = (time: number) => {
    viewer.seekReplay(time);
    while (viewer.replay!.seeking) viewer.step(0.05);
    return structuredClone(viewer.battle);
  };
  for (const [step, snapshot] of [...snapshots].reverse())
    expect(seek(step * 0.05), `step ${step}`).toEqual(JSON.parse(snapshot));
  expect(seek(9999)).toEqual(JSON.parse(JSON.stringify(final)));
  viewer.returnHome();
  expect(JSON.stringify(viewer.state)).toBe(home);
}

describe('Eagle Artillery and Scattershot campaign gates', () => {
  it('unlocks every village whose remaining late families are these two', () => {
    expect(
      lateCampaignIssues([
        [1000031, 0, 0, 7],
        [1000067, 0, 0, 7],
      ]),
    ).toEqual([]);
    const blocked = (index: number) => nativeCampaignIssues(index);
    for (const index of [61, 63, 65, 68, 70])
      expect(blocked(index), NATIVE_CAMPAIGN[index].name).toEqual([]);
    for (const index of [
      67, 69, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 88, 89,
    ])
      expect(blocked(index)).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/Eagle Artillery|Scattershot/)]),
      );
    expect(NATIVE_CAMPAIGN[65].name).toBe('Where Eagles Dare');
  });
  it('accepts these buildings only in version 44 campaign recordings', () => {
    const data = (version: number, practice: boolean, kind: 'eagleartillery' | 'scattershot') => {
      const setup = lateSetup(65, { giant: 1 }, {}, [
        makeBuilding(1, kind, 20, 20, 7),
        makeBuilding(2, 'townhall', 2, 2, 1),
      ]);
      const replay = replayData(setup, [], 0);
      replay.version = version;
      if (practice) {
        replay.initial = {
          ...replay.initial,
          practice: true,
          catalog: undefined,
          scenery: undefined,
          availableLoot: undefined,
          lootRoom: undefined,
        };
        delete replay.initial.catalog;
        delete replay.initial.scenery;
      }
      return replay;
    };
    for (const kind of ['eagleartillery', 'scattershot'] as const) {
      expect(validateReplay(data(44, false, kind))).toBe(true);
      expect(validateReplay(data(43, false, kind))).toBe(false);
      expect(validateReplay(data(44, true, kind))).toBe(false);
      const eight = data(44, false, kind);
      eight.initial.buildings[0].level = 8;
      expect(validateReplay(eight)).toBe(false);
    }
    // The complete 820-entity Underground Workaround fits version 44; older limits stay.
    const large = replayData(lateSetup(61, { giant: 1 }), [], 0);
    expect(large.initial.buildings.length).toBe(820);
    expect(validateReplay(large)).toBe(true);
    expect(parseReplayFile(JSON.stringify(makeReplayFile(large))).initial.buildings).toHaveLength(
      820,
    );
    const legacy = structuredClone(large);
    legacy.version = 43;
    legacy.initial.buildings = Array.from({ length: 601 }, (_, i) =>
      makeBuilding(i + 1, 'wall', 2 + (i % 44), 2 + Math.floor(i / 44), 1),
    );
    expect(validateReplay(legacy)).toBe(false);
    legacy.initial.buildings.pop();
    expect(validateReplay(legacy)).toBe(true);
    expect(replayBattle(large.initial, 44).late).toEqual({});
  });
});

describe('Eagle Artillery and Scattershot replays', () => {
  it('records Where Eagles Dare from the campaign and reconstructs it across backward seeks', () => {
    const m = new GameModel(developedSave());
    m.state.nativeCampaign = freshNativeCampaign();
    m.state.nativeCampaign.stars.fill(1);
    m.state.army = { ...emptyArmy(), giant: 24, archer: 40, wizard: 12, balloon: 6 };
    m.state.spells = { rage: 0, heal: 0, lightning: 2 };
    m.state.king = undefined;
    m.state.troopLevels = Object.fromEntries(
      TROOP_KEYS.map((k) => [k, maxTroopLevel(k)]),
    ) as typeof m.state.army;
    m.startCampaign(65);
    const b = m.battle!;
    const plan: Deployment[] = [
      ...troopLine('giant', 24, 2, 12, 0.5, 0),
      // Archers follow the Giants, so light attackers stand inside shockwaves.
      ...troopLine('archer', 40, 2.6, 12, 0.3, 80),
      ...troopLine('balloon', 6, 24, 46, 0, 160).map((d, i) => ({ ...d, x: 20 + i })),
      ...troopLine('wizard', 12, 24, 2, 0, 240).map((d, i) => ({ ...d, x: 18 + i })),
      { step: 300, type: 'spell', kind: 'lightning', x: 30, y: 22 },
      { step: 300, type: 'spell', kind: 'lightning', x: 22, y: 30 },
    ];
    const seen: Observed = { awake: 0, shells: 0, pushes: 0, throws: 0, shards: 0 };
    const snapshots = new Map<number, string>();
    const housing: number[] = [];
    for (let step = 0; step < 4000 && !b.finished; step++) {
      const before = m.state.raidLog?.length ?? 0;
      applyDeployments(m, plan, step);
      expect(m.state.raidLog?.length ?? 0).toBe(before);
      if ([1, 81, 250, 301, 520, 900, 1400].includes(step)) snapshots.set(step, JSON.stringify(b));
      if ([79, 239, 299, 301].includes(step)) housing.push(eagleArtilleryDeployedHousing(b));
      observe(b, seen);
      m.step(0.05);
    }
    expect(housing).toEqual([120, 190, 238, 248]);
    expect(b.finished).toBe(true);
    expect(seen.awake).toBe(8);
    // Every tower fires at least one full volley.
    expect(seen.shells).toBeGreaterThanOrEqual(24);
    expect(seen.pushes).toBeGreaterThan(0);
    const replay = m.state.raidLog![0].replay!;
    expect(replay.actions.filter((a) => a.type === 'troop')).toHaveLength(82);
    verifyPlayback(replay, snapshots, b);
  }, 180_000);
  for (const [index, army, spells, plan, wanted] of [
    [
      75,
      { giant: 20, swordsman: 50, balloon: 16 },
      {},
      [
        ...troopLine('giant', 20, 2, 14, 0.5, 0),
        ...troopLine('swordsman', 50, 46, 10, 0.4, 60),
        ...troopLine('balloon', 16, 20, 46, 0, 120).map((d, i) => ({ ...d, x: 14 + i })),
      ],
      { throws: 1, shards: 1 },
    ],
    [
      80,
      { giant: 20, archer: 30, balloon: 10, wizard: 5 },
      { lightning: 4 },
      [
        // 200 housing at once wakes both Eagle Artilleries while the army still stands.
        ...troopLine('giant', 20, 2, 14, 0.5, 0),
        ...troopLine('archer', 30, 46, 10, 0.5, 0),
        ...troopLine('balloon', 10, 20, 46, 0, 0).map((d, i) => ({ ...d, x: 18 + i })),
        ...troopLine('wizard', 5, 20, 2, 0, 0).map((d, i) => ({ ...d, x: 20 + i })),
        ...[0, 1, 2, 3].map((i) => ({
          step: 100,
          type: 'spell' as const,
          kind: 'lightning' as const,
          x: 20 + i * 2,
          y: 24,
        })),
      ],
      { awake: 2, shells: 1, throws: 1, shards: 1 },
    ],
    [
      85,
      { giant: 30, archer: 30, wizard: 10 },
      {},
      [
        ...troopLine('giant', 30, 2, 12, 0.5, 0),
        ...troopLine('archer', 30, 46, 10, 0.5, 100),
        ...troopLine('wizard', 10, 22, 46, 0, 180).map((d, i) => ({ ...d, x: 18 + i })),
      ],
      { awake: 2, shells: 1 },
    ],
  ] as const)
    it(`reconstructs ${NATIVE_CAMPAIGN[index].name} (${index}) live combat across backward seeks`, () => {
      const setup = lateSetup(index, army, spells);
      setup.troopLevels = Object.fromEntries(
        TROOP_KEYS.map((k) => [k, maxTroopLevel(k)]),
      ) as typeof setup.troopLevels;
      const model = liveBattle(setup);
      const deployments = plan as readonly Deployment[];
      const seen: Observed = { awake: 0, shells: 0, pushes: 0, throws: 0, shards: 0 };
      const snapshots = new Map<number, string>();
      const steps = 1400;
      for (let step = 0; step < steps; step++) {
        const placed = model.battle!.units.length;
        applyDeployments(model, [...deployments], step);
        expect(model.battle!.units.length - placed).toBe(
          deployments.filter((d) => d.step === step && d.type === 'troop').length,
        );
        if ([1, 121, 261, 600, 1000].includes(step))
          snapshots.set(step, JSON.stringify(model.battle));
        observe(model.battle!, seen);
        model.step(0.05);
      }
      model.finishBattle();
      for (const [key, value] of Object.entries(wanted))
        expect(seen[key as keyof Observed], key).toBeGreaterThanOrEqual(value);
      verifyPlayback(replayData(setup, [...deployments], steps), snapshots, model.battle!);
    }, 180_000);
  it('uses the ungated native layouts only for villages still waiting on other families', () => {
    // Go to Bat (75) opened with the Ghost Trap; 80 and 85 still wait on armed Builder's Huts.
    for (const index of [80, 85]) expect(nativeCampaignIssues(index).length).toBeGreaterThan(0);
    expect(
      nativeLayout(80)
        .filter((b) => b.kind === 'eagleartillery')
        .map((b) => b.level),
    ).toEqual([5, 5]);
    expect(
      nativeLayout(80)
        .filter((b) => b.kind === 'scattershot')
        .map((b) => b.level),
    ).toEqual([3, 3, 3, 3]);
    expect(REPLAY_VERSION).toBe(44);
  });
});
