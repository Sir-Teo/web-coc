import { describe, expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { validateSave } from '../src/game/save';

describe('battery saver', () => {
  it('is off by default, toggles, and keeps the choice in a valid save', () => {
    const m = new GameModel();
    expect(m.state.settings.batterySaver).toBeUndefined();
    const revision = m.revision;
    m.toggleBatterySaver();
    expect(m.state.settings.batterySaver).toBe(true);
    expect(m.revision).toBeGreaterThan(revision);
    expect(validateSave(JSON.parse(JSON.stringify(m.state)))).toBe(true);
    expect(new GameModel(JSON.parse(JSON.stringify(m.state))).state.settings.batterySaver).toBe(
      true,
    );
    m.toggleBatterySaver();
    // Off is stored as absent, so older saves and new ones look the same.
    expect('batterySaver' in m.state.settings).toBe(false);
    expect(validateSave(JSON.parse(JSON.stringify(m.state)))).toBe(true);
  });
  it('rejects a save whose battery saver is not a boolean', () => {
    const bad = JSON.parse(JSON.stringify(new GameModel().state));
    bad.settings.batterySaver = 'yes';
    expect(validateSave(bad)).toBe(false);
  });
});
