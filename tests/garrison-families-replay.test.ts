import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Building } from '../src/game/model';
import { nativeLayout, nativeScenery } from '../src/game/native-campaign';
import {
  replayBattle,
  validateReplay,
  type ReplayData,
  type ReplaySetup,
} from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { campaignResources } from '../src/game/campaign-loot';
import { campaignStage } from '../src/game/campaign-catalog';
import { emptyArmy, emptySpells } from '../src/game/army';
import { campaignGarrisonSetup } from '../src/game/garrison-campaign';
import { stepGarrisonReleases, type GarrisonSetup } from '../src/game/garrison-release';
import { wizardTowerVillage } from './fixtures/wizard-tower-battle';

const MIXED: GarrisonSetup['troops'] = [
  { kind: 'goblin', level: 7, count: 4 },
  { kind: 'archer', level: 9, count: 2 },
  { kind: 'headhunter', level: 3, count: 1 },
  { kind: 'valkyrie', level: 7, count: 1 },
  { kind: 'babydragon', level: 6, count: 1 },
  { kind: 'superminion', level: 9, count: 1 },
  { kind: 'dragon', level: 5, count: 1 },
  { kind: 'pekka', level: 8, count: 1 },
];

function campaignSetup(index: number, bunker: (b: Building) => boolean, troops = MIXED) {
  const buildings = nativeLayout(index);
  const loot = campaignResources(campaignStage(index, 'goblin-v1'));
  const castle = buildings.find(bunker)!;
  const initial: ReplaySetup = {
    catalog: 'goblin-v1',
    scenery: nativeScenery(index),
    index,
    practice: false,
    buildings,
    army: { ...emptyArmy(), giant: 4, archer: 6, dragon: 2 },
    spells: emptySpells(),
    troopLevels: {
      ...emptyArmy(),
      swordsman: 1,
      archer: 1,
      giant: 1,
      wizard: 1,
      balloon: 1,
      goblin: 1,
      wallbreaker: 1,
      healer: 1,
      dragon: 1,
      pekka: 1,
    },
    spellLevels: {
      rage: 1,
      heal: 1,
      lightning: 1,
      freeze: 1,
      invisibility: 1,
      jump: 1,
      clone: 1,
      recall: 1,
      revive: 1,
    },
    nextId: 100000,
    availableLoot: loot,
    lootRoom: loot,
    garrisons: [{ castleId: castle.id, mode: 'guard', troops }],
  };
  return { initial, castle };
}

/** Authored input: deployments on the nearest legal grass around the bunker. */
function recording(index: number, bunker: (b: Building) => boolean, steps = 500): ReplayData {
  const { initial, castle } = campaignSetup(index, bunker);
  const probe = new GameModel();
  probe.battle = replayBattle(initial, 44);
  const center = { x: castle.x + 1.5, y: castle.y + 1.5 };
  const sites = Array.from({ length: 48 * 48 }, (_, i) => ({
    x: (i % 48) + 0.5,
    y: Math.floor(i / 48) + 0.5,
  }))
    .filter((p) => !probe.deployBlocked(p.x, p.y))
    .sort(
      (a, b) =>
        Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y),
    );
  const kinds = [
    'giant',
    'giant',
    'archer',
    'archer',
    'archer',
    'dragon',
    'giant',
    'archer',
  ] as const;
  return {
    version: 44,
    initial,
    steps: Array(steps).fill(0.05),
    actions: [
      ...kinds.map((kind, i) => ({
        step: i * 4,
        type: 'troop' as const,
        kind,
        x: sites[i].x,
        y: sites[i].y,
      })),
      { step: steps, type: 'end' as const },
    ],
  };
}

it('portably reconstructs mixed garrison families on the original Goblin Castle with backward seeks', () => {
  const data = recording(67, (b) => b.npc === 'goblin-castle');
  expect(validateReplay(data)).toBe(true);
  const parsed = parseReplayFile(JSON.stringify(makeReplayFile(data)));
  expect(parsed.initial.garrisons).toEqual(data.initial.garrisons);
  const viewer = new GameModel();
  expect(viewer.openReplay(parsed)).toBe(true);
  const seek = (at: number) => {
    viewer.seekReplay(at);
    while (viewer.replay!.seeking) viewer.step(0.05);
    return structuredClone(viewer.battle!);
  };
  const late = seek(20);
  const released = late.defenders!.filter((d) => d.kind !== 'skeleton');
  expect(released.length).toBeGreaterThanOrEqual(6);
  expect(new Set(released.map((d) => d.kind)).size).toBeGreaterThanOrEqual(4);
  expect(released.some((d) => d.kind !== 'skeleton' && d.attacks.length > 0)).toBe(true);
  const early = seek(3);
  expect(early.defenders!.length).toBeLessThan(late.defenders!.length);
  expect(seek(20)).toEqual(late);
  // A second, independent viewer agrees with the first.
  const other = new GameModel();
  expect(other.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
  other.seekReplay(20);
  while (other.replay!.seeking) other.step(0.05);
  expect(other.battle).toEqual(late);
});

it('releases the Foreboding Cave roster from its 4×4 footprint', () => {
  const { initial, castle } = campaignSetup(74, (b) => b.npc === 'foreboding-cave', [
    { kind: 'dragon', level: 5, count: 4 },
  ]);
  expect(castle).toMatchObject({ kind: 'camp', npc: 'foreboding-cave' });
  const battle = replayBattle(initial, 44);
  battle.units = [
    {
      id: 1,
      kind: 'giant',
      x: castle.x + 6,
      y: castle.y + 2,
      hp: 1000,
      maxHp: 1000,
      cooldown: 0,
      target: null,
      path: [],
      pathAt: 0,
      attacking: false,
    },
  ];
  battle.elapsed = 1.2;
  stepGarrisonReleases(battle);
  expect(battle.defenders!.map((d) => [d.x - castle.x, d.y - castle.y])).toEqual([
    [3.75, 2],
    [0.25, 2],
    [2, 3.75],
    [2, 0.25],
  ]);
  expect(
    validateReplay({ ...recording(74, (b) => b.npc === 'foreboding-cave', 60), initial }),
  ).toBe(true);
  expect(
    validateReplay({ ...recording(74, (b) => b.npc === 'foreboding-cave', 60), version: 43 }),
  ).toBe(false);
});

it('matches campaign bunkers exactly and gates new kinds, levels and bunkers by replay version', () => {
  const layout = nativeLayout(67);
  const [setup] = campaignGarrisonSetup(67, layout)!;
  expect(setup).toEqual({
    castleId: layout.find((b) => b.npc === 'goblin-castle')!.id,
    mode: 'guard',
    troops: [{ kind: 'goblin', level: 7, count: 40 }],
  });
  expect(campaignGarrisonSetup(77, nativeLayout(77))![0].troops).toEqual([
    { kind: 'superminion', level: 9, count: 4 },
    { kind: 'archer', level: 9, count: 2 },
  ]);
  expect(() => campaignGarrisonSetup(72, nativeLayout(67))).toThrow();

  const save = wizardTowerVillage();
  save.buildings[5] = makeBuilding(6, 'clancastle', 18, 18, 5);
  const m = new GameModel(save);
  m.startBattle(0, true);
  m.activeTroop = 'giant';
  expect(m.deploy(10, 18)).toBe(true);
  for (let i = 0; i < 20; i++) m.step(0.05);
  m.finishBattle();
  const replay = structuredClone(m.state.raidLog![0].replay!);
  const withTroops = (version: number, troops: GarrisonSetup['troops']) => ({
    ...replay,
    version,
    initial: { ...replay.initial, garrisons: [{ castleId: 6, mode: 'guard', troops }] },
  });
  expect(validateReplay(withTroops(43, [{ kind: 'dragon', level: 7, count: 1 }]))).toBe(true);
  expect(validateReplay(withTroops(38, [{ kind: 'balloon', level: 8, count: 3 }]))).toBe(true);
  for (const troops of [
    [{ kind: 'goblin', level: 7, count: 1 }],
    [{ kind: 'dragon', level: 5, count: 1 }],
    [{ kind: 'superminion', level: 9, count: 1 }],
    // The remaining roster families are version-44 only as well.
    [{ kind: 'electrodragon', level: 3, count: 1 }],
    [{ kind: 'golem', level: 8, count: 1 }],
    [{ kind: 'witch', level: 4, count: 1 }],
    [{ kind: 'bowler', level: 4, count: 1 }],
    [{ kind: 'lavahound', level: 6, count: 1 }],
    [{ kind: 'electrotitan', level: 2, count: 1 }],
    [{ kind: 'goldendragon', level: 1, count: 1 }],
    [{ kind: 'momma', level: 1, count: 1 }],
  ] as GarrisonSetup['troops'][]) {
    expect(validateReplay(withTroops(43, troops))).toBe(false);
    expect(validateReplay(withTroops(44, troops))).toBe(true);
  }
  // Spawned-only kinds never occupy a bunker, in any version.
  for (const kind of ['golemite', 'lavapup', 'summonedskeleton', 'royalghost'] as const)
    expect(
      validateReplay(
        withTroops(44, [
          {
            kind,
            level: { golemite: 8, lavapup: 1, summonedskeleton: 1, royalghost: 7 }[kind],
            count: 1,
          },
        ]),
      ),
    ).toBe(false);
  expect(validateReplay(withTroops(44, [{ kind: 'golem', level: 7, count: 1 }]))).toBe(false);
  expect(validateReplay(withTroops(44, [{ kind: 'unknown' as never, level: 8, count: 1 }]))).toBe(
    false,
  );
  // A garrison must reference an actual source bunker, never an arbitrary building.
  expect(
    validateReplay({
      ...withTroops(44, [{ kind: 'goblin', level: 7, count: 1 }]),
      initial: {
        ...withTroops(44, []).initial,
        garrisons: [
          { castleId: 1, mode: 'guard', troops: [{ kind: 'goblin', level: 7, count: 1 }] },
        ],
      },
    }),
  ).toBe(false);
});
