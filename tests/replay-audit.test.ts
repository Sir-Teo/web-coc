import { describe, it, expect, vi } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { CAMPAIGN, TROOP_KEYS } from '../src/game/data';
import { emptyArmy, emptySpells } from '../src/game/army';
import {
  REPLAY_VERSION,
  MAX_REPLAY_STEPS_PER_UPDATE,
  validateReplay,
  type ReplayData,
} from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { validateSave } from '../src/game/save';

function simpleReplay(): ReplayData {
  return {
    version: REPLAY_VERSION,
    initial: {
      index: 11,
      practice: false,
      nextId: 500,
      buildings: [makeBuilding(1, 'goldmine', 10, 10)],
      army: emptyArmy(),
      spells: { ...emptySpells(), lightning: 1 },
      spellLevels: { lightning: 1, heal: 1, rage: 1 },
      troopLevels: Object.fromEntries(TROOP_KEYS.map((k) => [k, 3])) as ReturnType<
        typeof emptyArmy
      >,
      lootRoom: { gold: CAMPAIGN[11].gold, elixir: CAMPAIGN[11].elixir },
    },
    steps: [],
    actions: [
      { step: 0, type: 'spell', kind: 'lightning', x: 11, y: 11 },
      { step: 0, type: 'end' },
    ],
  };
}

describe('replay isolation and input budgets', () => {
  it('reproduces a capacity-limited raid, including its result, after file sharing and seeking', () => {
    const m = new GameModel();
    m.state.gold = m.resourceCap('gold') - 11;
    m.state.elixir = m.resourceCap('elixir');
    m.state.spells.lightning = 1;
    m.startBattle(0);
    m.activeSpell = 'lightning';
    const mine = m.battle!.buildings.find((b) => b.kind === 'goldmine')!;
    expect(m.castSpell(mine.x + 1.5, mine.y + 1.5)).toBe(true);
    m.step(0.05);
    m.finishBattle();
    const result = structuredClone(m.battle!.result);
    const loot = structuredClone(m.battle!.loot);
    expect(loot).toEqual({ gold: 11, elixir: 0 });
    const recording = m.state.raidLog![0].replay!;
    expect(recording.initial.lootRoom).toEqual({ gold: 11, elixir: 0 });
    const data = parseReplayFile(JSON.stringify(makeReplayFile(recording)));
    const viewer = new GameModel();
    const home = structuredClone(viewer.state);
    expect(viewer.openReplay(data)).toBe(true);
    viewer.step(1);
    expect(viewer.battle!.loot).toEqual(loot);
    expect(viewer.battle!.result).toEqual(result);
    viewer.seekReplay(0);
    viewer.seekReplay(1);
    expect(viewer.battle!.result).toEqual(result);
    expect(viewer.state).toEqual(home);
  });

  it('does not apply the playback runner village capacity to recorded loot', () => {
    const data = simpleReplay();
    data.initial.buildings[0].hp = data.initial.buildings[0].maxHp = 1;
    const m = new GameModel();
    m.state.gold = m.resourceCap('gold');
    const home = structuredClone(m.state);
    expect(m.openReplay(data)).toBe(true);
    expect(m.battle!.result!.gold).toBe(CAMPAIGN[11].gold);
    expect(m.battle!.result!.destruction).toBe(100);
    expect(m.state).toEqual(home);
  });

  it('finishes home research from the home level while watching older troop levels', () => {
    const data = simpleReplay();
    data.actions = [{ step: 1, type: 'end' }];
    data.steps = [1];
    const m = new GameModel();
    m.state.research = { kind: 'giant', end: m.clock + 100 };
    m.openReplay(data);
    expect(m.troopLevel('giant')).toBe(3);
    m.tick(m.clock + 200);
    expect(m.state.troopLevels!.giant).toBe(2);
    expect(m.troopLevel('giant')).toBe(3);
    m.returnHome();
    expect(m.troopLevel('giant')).toBe(2);
    expect(validateSave(m.state)).toBe(true);
  });

  it('limits normal playback work per update even with tiny imported time steps', () => {
    const data = simpleReplay();
    data.steps = Array(6000).fill(0.000001);
    data.actions = [{ step: 6000, type: 'end' }];
    expect(validateReplay(data)).toBe(true);
    const m = new GameModel();
    m.openReplay(data);
    m.step(1);
    expect(m.replay!.time).toBeCloseTo(MAX_REPLAY_STEPS_PER_UPDATE * 0.000001, 9);
    expect(m.replay!.complete).toBe(false);
    for (let i = 0; i < 60 && !m.replay!.complete; i++) m.step(0.05);
    expect(m.replay!.complete).toBe(true);
    expect(m.replay!.time).toBeCloseTo(0.006, 9);
  });

  it('yields playback and seeking when the frame work budget is exhausted', () => {
    const data = simpleReplay();
    data.steps = Array(200).fill(0.05);
    data.actions = [{ step: 200, type: 'end' }];
    const m = new GameModel();
    m.openReplay(data);
    let now = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => (now += 10));
    try {
      m.step(1);
      expect(m.replay!.time).toBe(0.05);
      m.seekReplay(5);
      expect(m.replay!.time).toBe(0.05);
      expect(m.replay!.seeking).toBe(true);
    } finally {
      clock.mockRestore();
    }
    for (let i = 0; i < 20 && m.replay!.seeking; i++) m.step(0.05);
    expect(m.replay!.seeking).toBe(false);
    expect(m.replay!.time).toBeCloseTo(5);
  });

  it('rejects oversized rosters and invalid loot limits without replacing current playback', () => {
    const m = new GameModel(),
      source = simpleReplay();
    m.openReplay(source);
    const original = m.battle;
    for (const mutate of [
      (r: ReplayData) => {
        r.initial.army.swordsman = 701;
      },
      (r: ReplayData) => {
        r.initial.spells.lightning = 101;
      },
      (r: ReplayData) => {
        delete r.initial.lootRoom;
      },
      (r: ReplayData) => {
        r.initial.lootRoom!.gold = -1;
      },
      (r: ReplayData) => {
        r.initial.lootRoom!.gold = CAMPAIGN[11].gold + 1;
      },
    ]) {
      const invalid = structuredClone(source);
      mutate(invalid);
      expect(validateReplay(invalid)).toBe(false);
      expect(m.openReplay(invalid)).toBe(false);
      expect(m.battle).toBe(original);
    }
    expect(m.openReplay(null as unknown as ReplayData)).toBe(false);
  });

  it('keeps oversized debug attacks saveable by omitting unsupported recordings', () => {
    const m = new GameModel();
    m.state.army.swordsman = 701;
    m.startBattle(0);
    m.finishBattle();
    expect(m.state.raidLog).toHaveLength(1);
    expect(m.state.raidLog![0].replay).toBeUndefined();
    expect(validateSave(m.state)).toBe(true);
  });

  it('preserves older recording payloads in a save while refusing their incompatible playback', () => {
    const m = new GameModel();
    m.startBattle(0);
    m.finishBattle();
    const legacy = m.state.raidLog![0].replay!;
    legacy.version = 3;
    legacy.initial.army.swordsman = 1000;
    delete legacy.initial.lootRoom;
    expect(validateSave(m.state)).toBe(true);
    expect(m.startReplay(m.state.raidLog![0].id)).toBe(false);
    expect(m.state.raidLog![0].replay).toBe(legacy);
  });
});
