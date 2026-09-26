import { describe, expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { MAX_REPLAY_ACTIONS, MAX_REPLAY_STEPS, type ReplayData } from '../src/game/replay';
import { MAX_SAVE_FILE_BYTES, parseSaveFile, saveFileText, validateSave } from '../src/game/save';

/** A village whose log holds the longest recordings the replay validator accepts. */
function heaviestVillage(records: number) {
  const m = new GameModel();
  m.state.spells.lightning = 1;
  m.startBattle(0, true);
  m.activeSpell = 'lightning';
  expect(m.castSpell(10, 10)).toBe(true);
  m.step(0.05);
  m.finishBattle();
  m.returnHome();
  const template = m.state.raidLog![0];
  const spell = template.replay!.actions[0];
  // Frame deltas are arbitrary doubles: the longest decimal spelling of each is the worst case.
  const replay: ReplayData = {
    ...template.replay!,
    steps: Array.from({ length: MAX_REPLAY_STEPS }, () => 0.012345678901234568),
    actions: [
      ...Array.from({ length: MAX_REPLAY_ACTIONS - 1 }, (_, i) => ({ ...spell, step: i * 30 })),
      { step: MAX_REPLAY_STEPS, type: 'end' as const },
    ],
  };
  m.state.raidLog = Array.from({ length: records }, (_, i) => ({
    ...structuredClone(template),
    id: m.state.nextId + i,
    replay: structuredClone(replay),
  }));
  m.state.nextId += records;
  return m.state;
}

describe('village backup files', () => {
  it('round-trips a village carrying five maximum-length recordings', () => {
    const state = heaviestVillage(5);
    expect(validateSave(state)).toBe(true);
    const file = saveFileText(state);
    expect(file.droppedRecordings).toBe(0);
    expect(new TextEncoder().encode(file.text).length).toBeLessThanOrEqual(MAX_SAVE_FILE_BYTES);
    expect(parseSaveFile(file.text)).toEqual(state);
  });

  it('drops the oldest recordings rather than write a file the importer refuses', () => {
    const state = heaviestVillage(20);
    const file = saveFileText(state);
    expect(file.droppedRecordings).toBeGreaterThan(0);
    expect(new TextEncoder().encode(file.text).length).toBeLessThanOrEqual(MAX_SAVE_FILE_BYTES);
    const restored = JSON.parse(file.text);
    // The newest recordings are kept; the oldest go first.
    expect(restored.raidLog[0].replay).toBeDefined();
    expect(restored.raidLog.at(-1).replay).toBeUndefined();
    // The village itself is untouched.
    expect(state.raidLog!.every((record) => record.replay)).toBe(true);
  });

  it('writes a village-only backup without recordings', () => {
    const state = heaviestVillage(2);
    const file = saveFileText(state, false);
    expect(file.droppedRecordings).toBe(2);
    const restored = parseSaveFile(file.text)!;
    expect(restored.raidLog!.map((record) => record.replay)).toEqual([undefined, undefined]);
    expect(restored.raidLog!.map((record) => record.id)).toEqual(state.raidLog!.map((r) => r.id));
  });

  it('refuses malformed and oversized text', () => {
    expect(parseSaveFile('{broken')).toBeNull();
    expect(parseSaveFile(JSON.stringify({ version: 4 }))).toBeNull();
    expect(parseSaveFile(' '.repeat(MAX_SAVE_FILE_BYTES + 1))).toBeNull();
  });
});
