import { developedSave } from './fixtures/developed-village';
import { describe, it, expect } from 'vitest';
import { GameModel, initialSave } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { validateSave, migrateSave } from '../src/game/save';

describe('instant army preparation', () => {
  it('prepares troops and spells without elixir or waiting', () => {
    const m = new GameModel(developedSave());
    m.clearArmy();
    m.state.elixir = 0;
    m.train('giant', 5);
    m.brew('rage');
    m.brew('lightning', 2);
    expect(m.state.army.giant).toBe(5);
    expect(m.state.spells).toEqual({ rage: 1, heal: 0, lightning: 2, freeze: 0 });
    expect(m.spellHousing).toBe(4);
    expect(m.state.elixir).toBe(0);
    expect(m.state.queue).toEqual([]);
    expect(m.state.spellQueue).toEqual([]);
  });
  it('checks the whole batch, including weighted spell housing', () => {
    const m = new GameModel(developedSave());
    m.clearArmy();
    m.brew('rage', 2);
    m.brew('lightning');
    m.brew('heal');
    expect(m.state.spells.heal).toBe(0);
    m.brew('lightning', 2);
    expect(m.state.spells.lightning).toBe(1);
    m.brew('lightning');
    expect(m.spellHousing).toBe(m.spellCapacity);
    const almostFull = m.capacity / 5 - 1;
    m.state.army.giant = almostFull;
    m.train('giant', 2);
    expect(m.state.army.giant).toBe(almostFull);
    m.train('giant');
    expect(m.armySize).toBe(m.capacity);
  });
  it('removes individual troops and spells without underflow, and clears everything', () => {
    const m = new GameModel();
    m.clearArmy();
    m.train('wallbreaker');
    m.brew('heal');
    m.removeTroop('wallbreaker');
    m.removeTroop('wallbreaker');
    m.removeSpell('heal');
    m.removeSpell('heal');
    expect(m.armySize).toBe(0);
    expect(m.spellHousing).toBe(0);
    m.train('archer', 5);
    m.brew('rage');
    m.clearArmy();
    expect(m.state.army).toEqual(emptyArmy());
    expect(m.state.spells).toEqual(emptySpells());
  });
  it('completes old paid queues once when a village opens', () => {
    const s = initialSave();
    s.army = emptyArmy();
    s.spells = emptySpells();
    s.queue = [{ kind: 'giant', end: Date.now() + 999999 }];
    s.spellQueue = [{ kind: 'heal', end: Date.now() + 999999 }];
    const elixir = s.elixir;
    const m = new GameModel(s);
    expect(m.state.army.giant).toBe(1);
    expect(m.state.spells.heal).toBe(1);
    expect(m.state.elixir).toBe(elixir);
    m.tick(m.clock + 1000000);
    expect(m.state.army.giant).toBe(1);
    expect(m.state.spells.heal).toBe(1);
    expect(validateSave(m.state)).toBe(true);
  });
  it('cannot alter the home army while a battle is active', () => {
    const m = new GameModel();
    m.startBattle(0);
    const army = { ...m.state.army },
      spells = { ...m.state.spells };
    m.clearArmy();
    m.train('archer');
    m.removeTroop('archer');
    m.brew('lightning');
    m.removeSpell('heal');
    expect(m.state.army).toEqual(army);
    expect(m.state.spells).toEqual(spells);
  });
});

describe('quick armies', () => {
  it('saves and equips a named troop-and-spell composition after reloading', () => {
    const m = new GameModel();
    m.saveArmyPreset(0, 'Breach & loot');
    const original = { army: { ...m.state.army }, spells: { ...m.state.spells } };
    m.clearArmy();
    const restored = new GameModel(structuredClone(m.state));
    restored.loadArmyPreset(0);
    expect(restored.state.armyPresets![0]!.name).toBe('Breach & loot');
    expect(restored.state.army).toEqual(original.army);
    expect(restored.state.spells).toEqual(original.spells);
    expect(validateSave(restored.state)).toBe(true);
  });
  it('rejects a preset as a whole when either housing limit is exceeded', () => {
    const m = new GameModel();
    m.saveArmyPreset(0);
    m.clearArmy();
    m.train('archer');
    const before = { ...m.state.army };
    m.state.armyPresets![0]!.spells.lightning = 10;
    m.loadArmyPreset(0);
    expect(m.state.army).toEqual(before);
    expect(m.spellCount).toBe(0);
    m.state.armyPresets![0]!.spells = emptySpells();
    m.state.armyPresets![0]!.army.giant = 50;
    m.loadArmyPreset(0);
    expect(m.state.army).toEqual(before);
  });
  it('does not partially replenish spells when troops cannot fit', () => {
    const m = new GameModel();
    m.startBattle(0);
    m.finishBattle();
    m.returnHome();
    m.clearArmy();
    m.state.army.balloon = 12;
    m.retrain();
    expect(m.state.army.balloon).toBe(12);
    expect(m.state.army.swordsman).toBe(0);
    expect(m.spellCount).toBe(0);
  });
  it('caps preset slots and name length and rejects invalid saved data', () => {
    const m = new GameModel();
    m.saveArmyPreset(3);
    expect(m.state.armyPresets).toBeUndefined();
    m.saveArmyPreset(2, 'x'.repeat(99));
    expect(m.state.armyPresets![2]!.name).toHaveLength(32);
    expect(validateSave(m.state)).toBe(true);
    m.state.armyPresets![2]!.army.giant = -1;
    expect(validateSave(m.state)).toBe(false);
  });
});

describe('practice and battle history', () => {
  it('copies the village and consumes neither army nor spells, even on a full clear', () => {
    const m = new GameModel(developedSave());
    // Imported villages can exceed current storage limits; practice must preserve them too.
    m.state.gold = m.resourceCap('gold') + 123;
    m.state.elixir = m.resourceCap('elixir') + 456;
    const before = structuredClone(m.state);
    m.startBattle(0, true);
    expect(m.battle!.buildings[0]).not.toBe(m.state.buildings[0]);
    expect(m.battle!.buildings.map((b) => [b.kind, b.x, b.y])).toEqual(
      m.state.buildings.map((b) => [b.kind, b.x, b.y]),
    );
    m.activeTroop = 'giant';
    expect(m.deploy(1, 13)).toBe(true);
    m.activeSpell = 'rage';
    expect(m.castSpell(10, 10)).toBe(true);
    for (const b of m.battle!.buildings) m.damage(b, b.hp);
    m.finishBattle();
    expect(m.battle!.result).toEqual({
      gold: 0,
      elixir: 0,
      trophies: 0,
      stars: 3,
      destruction: 100,
    });
    for (const key of [
      'gold',
      'elixir',
      'trophies',
      'xp',
      'stars',
      'stats',
      'army',
      'spells',
      'buildings',
      'lastArmy',
    ] as const)
      expect(m.state[key]).toEqual(before[key]);
    expect(m.state.raidLog![0].deployed.giant).toBe(1);
    expect(m.state.raidLog![0].spells.rage).toBe(1);
    expect(validateSave(m.state)).toBe(true);
  });
  it('does not overwrite the last campaign army when practicing', () => {
    const m = new GameModel();
    m.startBattle(0);
    m.finishBattle();
    m.returnHome();
    const last = { ...m.state.lastArmy };
    m.clearArmy();
    m.train('archer');
    m.startBattle(0, true);
    m.finishBattle();
    expect(m.state.lastArmy).toEqual(last);
  });
  it('cannot replace an unfinished battle by starting another', () => {
    const m = new GameModel();
    m.startBattle(0);
    const battle = m.battle;
    m.startBattle(0, true);
    expect(m.battle).toBe(battle);
  });
  it('records campaign losses once, including deployed troops and spells', () => {
    const m = new GameModel(developedSave());
    m.startBattle(0);
    m.activeTroop = 'goblin';
    m.deploy(1, 13);
    m.activeSpell = 'heal';
    m.castSpell(1, 13);
    m.step(1);
    m.finishBattle();
    m.finishBattle();
    const log = m.state.raidLog!;
    expect(log).toHaveLength(1);
    expect(log[0].practice).toBe(false);
    expect(log[0].result.trophies).toBe(0);
    expect(log[0].duration).toBe(1);
    expect(log[0].deployed.goblin).toBe(1);
    expect(log[0].spells.heal).toBe(1);
    expect(log[0].deployed.giant).toBe(0);
    expect(validateSave(m.state)).toBe(true);
  });
  it('records no attack for leaving scouting, and keeps only twenty finished attacks', () => {
    const m = new GameModel();
    m.startBattle(0);
    m.returnHome();
    expect(m.state.raidLog).toBeUndefined();
    for (let i = 0; i < 23; i++) {
      m.startBattle(0, true);
      m.finishBattle();
      m.returnHome();
    }
    expect(m.state.raidLog).toHaveLength(20);
    expect(m.state.raidLog![0].id).toBeGreaterThan(m.state.raidLog![1].id);
    expect(validateSave(m.state)).toBe(true);
    const saved = new GameModel(structuredClone(m.state));
    expect(saved.state.raidLog).toEqual(m.state.raidLog);
  });
  it('validates log records and accepts saves from before presets or logs existed', () => {
    const m = new GameModel();
    expect(validateSave(migrateSave(m.state))).toBe(true);
    m.startBattle(0);
    m.finishBattle();
    m.state.raidLog![0].result.destruction = 101;
    expect(validateSave(m.state)).toBe(false);
  });
});
