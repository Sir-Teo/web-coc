import { describe, expect, it } from 'vitest';
import { GameModel, initialSave, makeBuilding, findPath, distanceTo } from '../src/game/model';
import { CAMPAIGN } from '../src/game/data';
import { freshCampaignLoot } from '../src/game/campaign-loot';
import { validateSave, migrateSave } from '../src/game/save';
import { MAX_REPLAY_STEPS, validateReplay } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

function clear(m: GameModel) {
  m.discardRecording(); // Direct damage is a fixture operation, not a recorded input.
  for (const b of m.battle!.buildings) m.damage(b, b.hp);
  m.finishBattle();
}
function reload(m: GameModel) {
  const save = JSON.parse(JSON.stringify(m.state));
  expect(validateSave(save)).toBe(true);
  return new GameModel(migrateSave(save) as typeof save);
}
function fullInventory(m = new GameModel()) {
  // Empty stores with room for the whole advertised haul: a starter Town Hall holds 7,000 of
  // each, below stage one's 8,500 gold. Overflow has its own case further down.
  m.townhall!.level = 3;
  m.state.gold = m.state.elixir = 0;
  m.startBattle(0);
  return m;
}

describe('single-player timing and finite village loot', () => {
  it('scouts indefinitely without using the army, starting combat or filling a replay', () => {
    const m = new GameModel();
    m.state.spells.heal = 1;
    m.startBattle(0);
    const before = structuredClone(m.state);
    for (let i = 0; i < MAX_REPLAY_STEPS + 1; i++) m.step(1);
    expect(m.battle).toMatchObject({ started: false, elapsed: 0, finished: false });
    expect(m.state).toEqual(before);
    m.activeSpell = 'heal';

    expect(m.castSpell(1, 1)).toBe(true);
    m.step(0.05);
    m.finishBattle();
    expect(m.state.raidLog![0].replay!.steps).toEqual([0.05]);
  });

  it('continues past three and five minutes, then shares and seeks the exact result', () => {
    const m = new GameModel();
    m.state.spells.heal = 1;
    m.startBattle(0);
    m.activeSpell = 'heal';
    m.castSpell(1, 1); // Begin without committing the army; no timer may end the attack.
    for (let i = 0; i < 6400; i++) m.step(0.05);
    expect(m.battle).toMatchObject({ started: true, finished: false });
    expect(m.battle!.elapsed).toBeCloseTo(320);
    m.finishBattle();
    expect(m.state.raidLog![0].duration).toBeCloseTo(320);
    expect(m.state.raidLog![0].result.trophies).toBe(0);
    const expected = structuredClone(m.battle);
    const loaded = reload(m);
    const data = parseReplayFile(JSON.stringify(makeReplayFile(loaded.state.raidLog![0].replay!)));
    const viewer = new GameModel();
    const home = structuredClone(viewer.state);
    expect(viewer.openReplay(data)).toBe(true);
    viewer.seekReplay(1e6);
    for (let i = 0; i < 1000 && viewer.replay!.seeking; i++) viewer.step(1);
    expect(viewer.replay!.complete).toBe(true);
    expect(viewer.battle).toEqual(expected);
    expect(viewer.state).toEqual(home);
  });

  it('depletes a cleared village once, persists it, and still awards stars on later attacks', () => {
    let m = fullInventory();
    const trophies = m.state.trophies;
    clear(m);
    expect(m.battle!.result).toEqual({
      gold: 8500,
      elixir: 6500,
      stars: 3,
      trophies: 0,
      destruction: 100,
    });
    expect(m.campaignLoot(0)).toEqual({ gold: 0, elixir: 0 });
    expect(m.campaignLoot(1)).toEqual({ gold: CAMPAIGN[1].gold, elixir: CAMPAIGN[1].elixir });
    const state = structuredClone(m.state);
    m.finishBattle();
    expect(m.state).toEqual(state);
    m = reload(m);
    m.state.stars[0] = 1; // A depleted stage must remain replayable for missing stars.
    m.startBattle(0);
    expect(m.battle!.buildings.every((b) => b.hp === b.maxHp)).toBe(true);
    expect(m.battle!.availableLoot).toEqual({ gold: 0, elixir: 0 });
    clear(m);
    expect(m.battle!.result).toEqual({
      gold: 0,
      elixir: 0,
      stars: 3,
      trophies: 0,
      destruction: 100,
    });
    expect(m.state.gold).toBe(8500);
    expect(m.state.elixir).toBe(6500);
    expect(m.state.trophies).toBe(trophies);
    expect(m.state.stars[0]).toBe(3);
  });

  it('settles partial loot on defeat and suspension without replenishing undamaged inventory', () => {
    let m = fullInventory();
    m.deploy(1, 1);
    const storage = m.battle!.buildings.find((b) => b.kind === 'goldstorage')!;
    m.discardRecording();
    m.damage(storage, storage.maxHp / 2);
    m.suspendBattle();
    const result = m.state.raidLog![0].result;
    expect(result.stars).toBe(0);
    expect(result.gold).toBeGreaterThan(0);
    expect(result.elixir).toBe(0);
    expect(result.trophies).toBe(0);
    expect(m.campaignLoot(0)).toEqual({ gold: 8500 - result.gold, elixir: 6500 });
    m = reload(m);
    m.startBattle(0);
    clear(m);
    expect(m.state.gold).toBe(8500);
    expect(m.state.elixir).toBe(6500);
    expect(m.campaignLoot(0)).toEqual({ gold: 0, elixir: 0 });
  });

  it('removes overflow from the enemy inventory and explains what could not be stored', () => {
    const m = new GameModel();
    m.state.gold = m.resourceCap('gold') - 11;
    m.state.elixir = m.resourceCap('elixir');
    m.startBattle(0);
    clear(m);
    expect(m.battle!.result).toMatchObject({
      gold: 11,
      elixir: 0,
      lostLoot: { gold: 8489, elixir: 6500 },
    });
    expect(m.state.gold).toBe(m.resourceCap('gold'));
    expect(m.state.elixir).toBe(m.resourceCap('elixir'));
    expect(reload(m).campaignLoot(0)).toEqual({ gold: 0, elixir: 0 });
  });

  it('snapshots a partially depleted treasury for replay independently of later home progress', () => {
    const m = new GameModel();
    m.state.campaignLoot = freshCampaignLoot();
    m.state.campaignLoot.remaining[0] = { gold: 400, elixir: 700 };
    m.state.gold = m.state.elixir = 0;
    m.state.spells.lightning = 1;
    m.startBattle(0);
    const mine = m.battle!.buildings.find((b) => b.kind === 'goldmine')!;
    m.activeSpell = 'lightning';
    m.castSpell(mine.x + 1, mine.y + 1);
    m.step(0.05);
    m.finishBattle();
    const result = structuredClone(m.battle!.result);
    const recording = m.state.raidLog![0].replay!;
    expect(result!.gold).toBeGreaterThan(0);
    expect(recording.initial.availableLoot).toEqual({ gold: 400, elixir: 700 });
    const viewer = new GameModel();
    const before = structuredClone(viewer.state);
    expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(recording))))).toBe(
      true,
    );
    viewer.step(1);
    expect(viewer.battle!.result).toEqual(result);
    expect(viewer.state).toEqual(before);
  });

  it('preserves older progress and results while introducing one finite treasury per village', () => {
    const s = initialSave();
    s.stars.fill(3);
    s.trophies = 1450;
    delete s.campaignLoot;
    const migrated = migrateSave(s);
    expect(migrated).toEqual(s);
    const m = new GameModel(migrated as typeof s);
    const copy = m.campaignLoot(0);
    copy.gold = 0;
    expect(m.campaignLoot(0).gold).toBe(8500);
    expect(m.state.campaignLoot).toBeUndefined();
    m.startBattle(0);
    clear(m);
    expect(m.state.stars).toEqual(s.stars);
    expect(m.state.trophies).toBe(1450);
    expect(reload(m).campaignLoot(0).gold).toBe(0);
  });

  it('never changes campaign loot in practice, scouting cancellation or failed attack entry', () => {
    const m = new GameModel();
    m.state.campaignLoot = freshCampaignLoot();
    m.state.campaignLoot.remaining[0] = { gold: 12, elixir: 34 };
    const loot = structuredClone(m.state.campaignLoot);
    for (const index of [NaN, 0.5, -1, Infinity, 12, 1]) {
      m.startBattle(index);
      expect(m.battle).toBeNull();
    }
    m.startBattle(0);
    m.suspendBattle();
    expect(m.state.campaignLoot).toEqual(loot);
    m.startBattle(0, true);
    clear(m);
    expect(m.state.campaignLoot).toEqual(loot);
    expect(m.state.stars.every((s) => s === 0)).toBe(true);
  });

  it('bounds recordings without putting a time limit on the actual attack', () => {
    const m = new GameModel();
    m.state.spells.heal = 1;
    m.startBattle(0);
    m.activeSpell = 'heal';
    m.castSpell(1, 1);
    for (let i = 0; i <= MAX_REPLAY_STEPS; i++) m.step(0.000001);
    expect(m.battle!.finished).toBe(false);
    m.finishBattle();
    expect(m.state.raidLog![0].replay).toBeUndefined();
    expect(m.state.raidLog![0].replayUnavailable).toBe('limit');
    expect(validateSave(m.state)).toBe(true);
  });
});

it('rejects malformed campaign inventories and forged replay inventories without repairing them', () => {
  for (const bad of [
    null,
    [],
    { catalog: 'unknown', remaining: [] },
    { ...freshCampaignLoot(), remaining: [] },
  ]) {
    const s = initialSave();
    s.campaignLoot = bad as any;
    expect(validateSave(migrateSave(s))).toBe(false);
  }
  for (const value of [-1, 0.5, NaN, Infinity, CAMPAIGN[0].gold + 1]) {
    const s = initialSave();
    s.campaignLoot = freshCampaignLoot();
    s.campaignLoot.remaining[0].gold = value;
    expect(validateSave(migrateSave(s))).toBe(false);
  }
  const m = new GameModel();
  m.startBattle(0);
  m.finishBattle();
  const original = m.state.raidLog![0].replay!;
  expect(validateReplay(original)).toBe(true);
  for (const bad of [
    undefined,
    null,
    { gold: -1, elixir: 0 },
    { gold: 1, elixir: 0 },
    { gold: 9000, elixir: 0 },
  ]) {
    const r = structuredClone(original);
    r.initial.availableLoot = bad as any;
    expect(validateReplay(r)).toBe(false);
  }
  const old = structuredClone(original);
  old.version = 24;
  delete old.initial.availableLoot;
  expect(validateReplay(old)).toBe(true);
});

it('moves the last ranged attacker into range when only its tile center can reach the target', () => {
  const m = new GameModel();
  m.state.army.wizard = 1;
  m.startBattle(0, true);
  m.activeTroop = 'wizard';
  m.deploy(1, 1);
  const b = m.battle!;
  const hall = makeBuilding(9000, 'townhall', 11, 10);
  const wizard = b.units[0];
  b.buildings = [hall];
  wizard.x = 16.598538107838504;
  wizard.y = 16.910967613019565;
  wizard.target = hall.id;
  wizard.path = [];
  const range = m.troopStats('wizard').range;
  expect(distanceTo(wizard, hall)).toBeGreaterThan(range);
  expect(findPath(wizard, hall, b.buildings, range)).toEqual([{ x: 16.5, y: 16.5 }]);
  for (let i = 0; i < 100; i++) m.step(0.05);
  expect(distanceTo(wizard, hall)).toBeLessThanOrEqual(range);
  expect(hall.hp).toBeLessThan(hall.maxHp);
});
