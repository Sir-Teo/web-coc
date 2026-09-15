import { expect, it } from 'vitest';
import { GameModel, makeBuilding, makeNpcBuilding } from '../src/game/model';
import { freshNativeCampaign } from '../src/game/native-campaign';
import { campaignResources, validCampaignResources } from '../src/game/campaign-loot';
import { validateSave } from '../src/game/save';
import { REPLAY_VERSION, validateReplay, replayBattle, type ReplayData } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { emptyArmy, emptySpells } from '../src/game/army';

function attack(index = 50, room = 10000) {
  const m = new GameModel();
  m.state.nativeCampaign = freshNativeCampaign();
  m.state.nativeCampaign.stars.fill(1);
  m.state.buildings.push(makeBuilding(m.state.nextId++, 'darkstorage', 2, 2));
  m.state.obstacles = [];
  m.state.dark = m.resourceCap('dark') - room;
  enterFixture(m, index);
  return m;
}
// Explicit combat fixture: the actual villages remain gated by unimplemented
// later defenses. These tests exercise their source loot with supported entities.
function fixtureRecord(m: GameModel, index = 50): ReplayData {
  const availableLoot = m.campaignLoot(index, 'goblin-v1');
  return {
    version: REPLAY_VERSION,
    initial: {
      catalog: 'goblin-v1',
      index,
      practice: false,
      buildings: [
        makeNpcBuilding(1000, 'goblin-townhall', 10, 10),
        ...(index === 51 ? [makeBuilding(1001, 'darkstorage', 20, 20)] : []),
      ],
      army: { ...m.state.army },
      spells: emptySpells(),
      troopLevels: Object.fromEntries(Object.keys(emptyArmy()).map((k) => [k, 1])) as ReturnType<
        typeof emptyArmy
      >,
      spellLevels: {
        lightning: 1,
        heal: 1,
        rage: 1,
        freeze: 1,
        invisibility: 1,
        jump: 1,
        clone: 1,
        recall: 1,
        revive: 1,
      },
      nextId: m.state.nextId,
      availableLoot,
      lootRoom: {
        gold: availableLoot.gold,
        elixir: availableLoot.elixir,
        dark: Math.min(availableLoot.dark!, Math.max(0, m.resourceCap('dark') - m.state.dark)),
      },
    },
    steps: [],
    actions: [{ step: 0, type: 'end' }],
  };
}
function enterFixture(m: GameModel, index = 50) {
  m.discardRecording();
  m.battle = replayBattle(fixtureRecord(m, index).initial);
}
function clear(m: GameModel) {
  m.discardRecording();
  for (const b of m.battle!.buildings) m.damage(b, b.hp);
  m.finishBattle();
}

it('keeps a zero Dark Elixir inventory distinct from the source village reward', () => {
  expect(campaignResources({ gold: 1, elixir: 2, dark: 0, darkElixir: 2000 })).toEqual({
    gold: 1,
    elixir: 2,
    dark: 0,
  });
  const m = attack();
  expect(m.battle!.availableLoot!.dark).toBe(2000);
  clear(m);
  expect(m.state.dark).toBe(2000);
  expect(m.battle!.result!.dark).toBe(2000);
  expect(m.state.nativeCampaign!.remaining[50].dark).toBe(0);
  const once = structuredClone(m.state);
  m.finishBattle();
  expect(m.state).toEqual(once);
  expect(validateSave(m.state)).toBe(true);
  const restored = new GameModel(JSON.parse(JSON.stringify(m.state)));
  expect(restored.campaignLoot(50, 'goblin-v1').dark).toBe(0);
  enterFixture(restored);
  clear(restored);
  expect(restored.state.dark).toBe(2000);
  expect(restored.battle!.result!.dark).toBe(0);
});

it('settles partial Dark Elixir once on suspension, including full-storage overflow', () => {
  const m = attack(50, 137);
  m.deploy(1, 1);
  m.discardRecording();
  const hall = m.battle!.buildings.find((b) => b.kind === 'townhall')!;
  m.damage(hall, hall.maxHp / 2);
  m.suspendBattle();
  expect(m.state.dark).toBe(10000);
  expect(m.state.raidLog![0].result).toMatchObject({ dark: 137, lostLoot: { dark: 863 } });
  expect(m.state.nativeCampaign!.remaining[50].dark).toBe(1000);
  expect(validateSave(m.state)).toBe(true);
});

it('shares Dark Elixir only between the matching native storage and Town Hall', () => {
  const m = attack(51);
  m.discardRecording();
  const b = m.battle!,
    storage = b.buildings.find((v) => v.kind === 'darkstorage')!;
  m.damage(storage, storage.maxHp / 2);
  m.finishBattle();
  expect(b.lootTaken!.dark).toBe(625);
  expect(b.result!.dark).toBe(625);
  expect(b.result!.gold).toBe(0);
  expect(b.result!.elixir).toBe(0);
  expect(m.state.nativeCampaign!.remaining[51].dark).toBe(1875);
});

it('reports all Dark Elixir as lost without a storage and leaves practice and scouting inventory unchanged', () => {
  const m = attack(50, 0);
  m.state.buildings = m.state.buildings.filter((b) => b.kind !== 'darkstorage');
  m.state.dark = 0;
  clear(m);
  expect(m.state.dark).toBe(0);
  expect(m.battle!.result).toMatchObject({ dark: 0, lostLoot: { dark: 2000 } });
  m.returnHome();
  const inventory = structuredClone(m.state.nativeCampaign);
  enterFixture(m, 51);
  m.suspendBattle();
  expect(m.state.nativeCampaign).toEqual(inventory);
  m.startBattle(0, true);
  clear(m);
  expect(m.state.nativeCampaign).toEqual(inventory);
  expect(m.state.dark).toBe(0);
});

it('exports, replays and rewinds a capacity-limited three-resource battle without altering home balances', () => {
  const seed = attack();
  const data = fixtureRecord(seed);
  data.initial.buildings = [makeNpcBuilding(1000, 'goblin-townhall', 10, 10)];
  data.initial.army = { ...emptyArmy(), giant: 1 };
  data.initial.spells = emptySpells();
  data.initial.lootRoom!.dark = 700;
  data.actions = [
    { step: 0, type: 'troop', kind: 'giant', x: 7, y: 10 },
    { step: 1000, type: 'end' },
  ];
  data.steps = Array(1000).fill(0.05);
  expect(data.version).toBe(REPLAY_VERSION);
  expect(validateReplay(data)).toBe(true);
  const imported = parseReplayFile(JSON.stringify(makeReplayFile(data)));
  expect(imported.initial.availableLoot!.dark).toBe(2000);
  expect(imported.initial.lootRoom!.dark).toBe(700);
  const viewer = new GameModel(),
    home = structuredClone(viewer.state);
  expect(viewer.openReplay(imported)).toBe(true);
  const seek = (at: number) => {
    viewer.seekReplay(at);
    for (let i = 0; i < 1000 && viewer.replay!.seeking; i++) viewer.step(0.05);
  };
  seek(1e6);
  const final = structuredClone(viewer.battle);
  expect(final!.result).toMatchObject({ dark: 700, lostLoot: { dark: 1300 }, destruction: 100 });
  seek(0);
  expect(viewer.battle!.lootTaken!.dark ?? 0).toBe(0);
  seek(1e6);
  expect(viewer.battle).toEqual(final);
  expect(viewer.state).toEqual(home);
});

it('rejects invalid or missing new Dark Elixir snapshots without corrupting older result records', () => {
  const m = attack();
  m.finishBattle();
  const data = fixtureRecord(m);
  for (const value of [undefined, -1, 0.5, NaN, Infinity, 2001]) {
    const invalid = structuredClone(data);
    invalid.initial.availableLoot!.dark = value;
    expect(validateReplay(invalid), String(value)).toBe(false);
  }
  for (const value of [undefined, -1, 0.5, NaN, Infinity, 2001]) {
    const invalid = structuredClone(data);
    invalid.initial.lootRoom!.dark = value;
    expect(validateReplay(invalid), String(value)).toBe(false);
  }
  expect(validCampaignResources({ gold: 0, elixir: 0, dark: 1 }, { gold: 500, elixir: 500 })).toBe(
    false,
  );
  const old = structuredClone(data);
  old.version = 31;
  delete old.initial.availableLoot!.dark;
  delete old.initial.lootRoom!.dark;
  expect(validateReplay(old)).toBe(true);
  const bad = structuredClone(m.state);
  bad.raidLog![0].result.dark = -1;
  expect(validateSave(bad)).toBe(false);
});
