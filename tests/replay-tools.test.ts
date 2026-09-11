import { developedSave } from './fixtures/developed-village';
import { describe, expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { makeReplayFile, parseReplayFile, MAX_REPLAY_FILE_BYTES } from '../src/game/replay-file';

function record() {
  const m = new GameModel(developedSave());
  m.startBattle(0, true);
  for (let i = 0; i < 50; i++) m.step(0.05);
  m.activeTroop = 'giant';
  m.deploy(1.2, 13);
  for (let i = 0; i < 1200 && !m.battle!.finished; i++) m.step(0.05);
  m.finishBattle();
  return m;
}
function settleSeek(m: GameModel) {
  let steps = 0;
  while (m.replay!.seeking && steps++ < 100) m.step(0.05);
  expect(m.replay!.seeking).toBe(false);
}
const battle = (m: GameModel) => structuredClone(m.battle);
describe('replay seeking', () => {
  it('reconstructs a projectile halfway through flight with its original impact deadline', () => {
    const m = new GameModel(developedSave());
    m.startBattle(0, true);
    m.activeTroop = 'giant';
    m.deploy(1.2, 13);
    m.step(0.05);
    m.step(0.1);
    const pending = structuredClone(m.battle!.projectiles);
    expect(pending?.length).toBeGreaterThan(0);
    expect(pending![0].launched).toBeLessThan(m.battle!.elapsed);
    expect(pending![0].impact).toBeGreaterThan(m.battle!.elapsed);
    m.step(2);
    m.finishBattle();
    const id = m.state.raidLog![0].id;
    m.returnHome();
    m.startReplay(id);
    m.seekReplay(0.15);
    settleSeek(m);
    expect(m.battle!.projectiles).toEqual(pending);
    m.seekReplay(0);
    settleSeek(m);
    expect(m.battle!.projectiles ?? []).toHaveLength(0);
    m.seekReplay(0.15);
    settleSeek(m);
    expect(m.battle!.projectiles).toEqual(pending);
  });
  it('matches sequential playback at earlier, later, and terminal boundaries without effects or save mutations', () => {
    const m = record();
    m.returnHome();
    const home = structuredClone(m.state);
    m.startReplay(home.raidLog![0].id);
    const ordinary = new GameModel(structuredClone(home));
    ordinary.startReplay(home.raidLog![0].id);
    for (let i = 0; i < 300; i++) ordinary.step(0.05);
    const at15 = battle(ordinary);
    for (let i = 0; i < 300; i++) ordinary.step(0.05);
    const at30 = battle(ordinary);
    for (let i = 0; i < 2000 && !ordinary.replay!.complete; i++) ordinary.step(0.05);
    const end = battle(ordinary);
    let effects = 0;
    m.onEffect = () => effects++;
    m.toggleReplay();
    m.setReplaySpeed(4);
    for (const [position, expected] of [
      [30, at30],
      [15, at15],
      [1e6, end],
    ] as const) {
      expect(m.seekReplay(position)).toBe(true);
      settleSeek(m);
      expect(battle(m)).toEqual(expected);
      expect(m.replay!.paused).toBe(true);
      expect(m.replay!.speed).toBe(4);
    }
    expect(effects).toBe(0);
    expect(m.state).toEqual(home);
    m.seekReplay(-5);
    settleSeek(m);
    expect(m.replay!.time).toBe(0);
    expect(m.battle!.units).toHaveLength(0);
    expect(m.replay!.complete).toBe(false);
    expect(m.seekReplay(NaN)).toBe(false);
    expect(m.seekReplay(Infinity)).toBe(false);
  });
  it('resumes playing after a seek, supersedes pending requests, and cancels on exit', () => {
    const m = record();
    m.startReplay(m.state.raidLog![0].id);
    m.seekReplay(50);
    expect(m.replay!.seeking).toBe(true);
    m.seekReplay(10);
    settleSeek(m);
    expect(m.replay!.time).toBeCloseTo(10);
    expect(m.replay!.paused).toBe(false);
    m.step(0.05);
    expect(m.replay!.time).toBeCloseTo(10.05);
    m.seekReplay(60);
    m.returnHome();
    m.step(5);
    expect(m.replay).toBe(null);
    expect(m.battle).toBe(null);
  });
  it('jumps to the first deployment and restores replay selection after restarting', () => {
    const m = record();
    const id = m.state.raidLog![0].id;
    m.startReplay(id);
    m.skipReplayScouting();
    settleSeek(m);
    expect(m.replay!.time).toBeCloseTo(2.5);
    expect(m.battle!.units).toHaveLength(1);
    expect(m.battle!.started).toBe(true);
    m.restartReplay();
    expect(m.replay).toMatchObject({ recordId: id, time: 0, paused: false });
  });
});
describe('portable replay files', () => {
  it('exports only known combat fields, strips inventories and extras, and supports standalone playback', () => {
    const m = record();
    const replay = m.state.raidLog![0].replay!;
    Object.assign(replay, { gold: 999, secret: 'do not share' });
    Object.assign(replay.initial, { armyPresets: ['private name'] });
    Object.assign(replay.initial.buildings[0], { note: 'private note' });
    const exported = makeReplayFile(replay);
    const encoded = JSON.stringify(exported);
    expect(encoded).not.toContain('do not share');
    expect(encoded).not.toContain('private name');
    expect(encoded).not.toContain('private note');
    expect(exported.replay.initial.buildings.every((b) => b.stored === 0)).toBe(true);
    const data = parseReplayFile(encoded);
    const viewer = new GameModel(developedSave());
    const home = structuredClone(viewer.state);
    expect(viewer.openReplay(data)).toBe(true);
    expect(viewer.replay!.recordId).toBe(null);
    viewer.seekReplay(1000);
    settleSeek(viewer);
    expect(viewer.battle!.units).toEqual(m.battle!.units);
    expect(viewer.battle!.destruction).toBe(m.battle!.destruction);
    expect(viewer.battle!.traps).toEqual(m.battle!.traps);
    expect(viewer.state).toEqual(home);
    viewer.restartReplay();
    expect(viewer.replay).toMatchObject({ recordId: null, time: 0 });
    viewer.returnHome();
    expect(viewer.state).toEqual(home);
  });
  it('rejects village backups, bad versions, malformed actions and oversized or invalid JSON', () => {
    const m = record();
    const file = makeReplayFile(m.state.raidLog![0].replay!);
    expect(() => parseReplayFile(JSON.stringify(m.state))).toThrow('replay file');
    expect(() => parseReplayFile('{')).toThrow('valid replay JSON');
    expect(() => parseReplayFile(' '.repeat(MAX_REPLAY_FILE_BYTES + 1))).toThrow('512 KB');
    expect(() => parseReplayFile(JSON.stringify({ ...file, version: 9 }))).toThrow();
    const wrongCombat = structuredClone(file);
    wrongCombat.replay.version++;
    expect(() => parseReplayFile(JSON.stringify(wrongCombat))).toThrow('different game version');
    const bad = structuredClone(file);
    (bad.replay.actions[0] as any).x = -100;
    expect(() => parseReplayFile(JSON.stringify(bad))).toThrow();
  });
  it('never interrupts an active attack to open a shared recording', () => {
    const source = record();
    const viewer = new GameModel(developedSave());
    viewer.startBattle(0);
    const active = viewer.battle;
    expect(viewer.openReplay(source.state.raidLog![0].replay!)).toBe(false);
    expect(viewer.battle).toBe(active);
    expect(viewer.replay).toBe(null);
  });
});
