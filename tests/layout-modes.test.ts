import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { validateSave } from '../src/game/save';

function village() {
  const m = new GameModel();
  const spell = makeBuilding(9000, 'spelltower', 2, 2, 4);
  const gear = makeBuilding(9001, 'multigeartower', 8, 2, 1);
  m.state.buildings = [
    makeBuilding(9002, 'townhall', 20, 20, 17),
    makeBuilding(9003, 'builder', 30, 30),
    spell,
    gear,
  ];
  m.state.nextId = 10000;
  m.state.obstacles = [];
  return { m, spell, gear };
}

it('layouts restore the Spell Tower spell and Multi-Gear Tower mode', () => {
  const { m, spell, gear } = village();
  m.beginEdit();
  m.saveLayout(0);
  m.selected = spell.id;
  expect(m.cycleSpellTowerMode()).toBe(true);
  expect(spell.spellMode).not.toBe('rage');
  m.selected = gear.id;
  expect(m.toggleGearMode()).toBe(true);
  expect(gear.gearMode).toBe('fast');
  expect(validateSave(m.state)).toBe(true);
  m.loadLayout(0);
  expect(spell.spellMode).toBe('rage');
  expect(gear.gearMode).toBe('long');
  expect(validateSave(m.state)).toBe(true);
});

it('mode changes in edit mode are undoable and redoable', () => {
  const { m, spell, gear } = village();
  m.beginEdit();
  m.selected = spell.id;
  m.cycleSpellTowerMode();
  const changed = spell.spellMode;
  m.selected = gear.id;
  m.toggleGearMode();
  m.undo();
  expect(gear.gearMode).toBe('long');
  expect(spell.spellMode).toBe(changed);
  m.undo();
  expect(spell.spellMode).toBe('rage');
  m.redo();
  m.redo();
  expect(spell.spellMode).toBe(changed);
  expect(gear.gearMode).toBe('fast');
});

it('rejects malformed layout modes and accepts layouts saved before they existed', () => {
  const { m } = village();
  m.saveLayout(0);
  const layout = m.state.layouts![0]!;
  expect(validateSave(m.state)).toBe(true);
  for (const slot of layout.slots) {
    delete slot.spellMode;
    delete slot.gearMode;
  }
  expect(validateSave(m.state)).toBe(true);
  (layout.slots[2] as { spellMode?: string }).spellMode = 'fireball';
  expect(validateSave(m.state)).toBe(false);
  delete layout.slots[2].spellMode;
  (layout.slots[3] as { gearMode?: string }).gearMode = 'sideways';
  expect(validateSave(m.state)).toBe(false);
});
