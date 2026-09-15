import { troopFacility } from '../src/game/army-unlocks';
import { describe, it, expect } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { TROOP_KEYS, SPELL_KEYS, maxLevelFor, maxCountFor } from '../src/game/data';
import { TROOP_UNLOCK, SPELL_UNLOCK } from '../src/game/army-unlocks';
import { emptyArmy, emptySpells } from '../src/game/army';
import { developedSave } from './fixtures/developed-village';

describe('army unlock progression', () => {
  it('starts with a consistent early village and only prepared, unlocked troops', () => {
    const m = new GameModel();
    expect(m.townhallLevel).toBe(2);
    expect(m.state.army).toEqual({ ...emptyArmy(), swordsman: 12, archer: 10 });
    expect(m.state.spells).toEqual(emptySpells());
    for (const b of m.state.buildings) {
      expect(b.level, b.kind).toBeLessThanOrEqual(maxLevelFor(b.kind, 2));
      expect(m.countOf(b.kind), b.kind).toBeLessThanOrEqual(maxCountFor(b.kind, 2));
    }
    for (const kind of TROOP_KEYS) if (m.state.army[kind]) expect(m.troopUnlocked(kind)).toBe(true);
    expect(m.state.buildings.some((b) => b.kind === 'spellfactory')).toBe(false);
  });

  it('unlocks the supported troop sequence at completed Barracks levels 1 through 7', () => {
    const m = new GameModel();
    const barracks = m.state.buildings.find((b) => b.kind === 'barracks')!;
    for (let level = 1; level <= 7; level++) {
      barracks.level = level;
      m.clearArmy();
      for (const kind of TROOP_KEYS) {
        m.train(kind);
        expect(m.state.army[kind], `${kind} at ${level}`).toBe(
          Number(troopFacility(kind) === 'barracks' && level >= TROOP_UNLOCK[kind]),
        );
      }
    }
    barracks.constructing = true;
    m.clearArmy();
    m.train('swordsman');
    expect(m.armySize).toBe(0);
  });

  it('unlocks Lightning, Healing and Rage at factory levels 1, 2 and 3', () => {
    const m = new GameModel();
    const factory = makeBuilding(m.state.nextId++, 'spellfactory', 21, 23);
    m.state.buildings.push(factory);
    for (let level = 1; level <= 3; level++) {
      factory.level = level;
      m.clearArmy();
      for (const kind of SPELL_KEYS) {
        m.brew(kind);
        expect(m.state.spells[kind], `${kind} at ${level}`).toBe(
          Number(level >= SPELL_UNLOCK[kind]),
        );
      }
    }
  });

  it('retains old unlocks during upgrades and grants the next one only on completion', () => {
    const m = new GameModel();
    m.clearArmy();
    const b = m.state.buildings.find((b) => b.kind === 'barracks')!;
    m.upgrade(b.id);
    expect(b.upgradeEnd).toBeGreaterThan(m.clock);
    m.train('archer');
    m.train('giant');
    expect(m.state.army.archer).toBe(1);
    expect(m.state.army.giant).toBe(0);
    m.tick(b.upgradeEnd!);
    m.train('giant');
    expect(m.state.army.giant).toBe(1);
  });

  it('requires the troop unlock before research can begin', () => {
    const m = new GameModel(developedSave());
    m.state.buildings.find((b) => b.kind === 'laboratory')!.level = 2;
    const barracks = m.state.buildings.find((b) => b.kind === 'barracks')!;
    barracks.level = 2;
    const before = m.state.elixir;
    m.researchTroop('giant');
    expect(m.state.research).toBeUndefined();
    expect(m.state.elixir).toBe(before);
    barracks.level = 3;
    m.researchTroop('giant');
    expect(m.state.research?.kind).toBe('giant');
  });

  it('rejects locked additions atomically while preserving imported prepared units', () => {
    const save = developedSave();
    save.buildings.find((b) => b.kind === 'barracks')!.level = 2;
    save.buildings.find((b) => b.kind === 'spellfactory')!.level = 2;
    const m = new GameModel(save);
    const original = { army: { ...m.state.army }, spells: { ...m.state.spells } };
    m.saveArmyPreset(0);
    m.loadArmyPreset(0);
    expect(m.state.army).toEqual(original.army);
    expect(m.state.spells).toEqual(original.spells);
    m.removeTroop('wizard');
    const before = { ...m.state.army };
    m.loadArmyPreset(0);
    expect(m.state.army).toEqual(before);
    expect(m.state.spells).toEqual(original.spells);
    m.state.lastArmy = original.army;
    m.state.lastSpells = original.spells;
    expect(m.retrain()).toBe(false);
    m.removeSpell('rage');
    m.brew('rage');
    expect(m.state.spells.rage).toBe(0);
    m.startBattle(0);
    expect(m.battle!.remaining.wizard).toBe(before.wizard);
  });
});
