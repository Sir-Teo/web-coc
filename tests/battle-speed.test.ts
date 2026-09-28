import { describe, expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { validateSave } from '../src/game/save';

describe('battle speed', () => {
  it('cycles 1×, 2×, 4× and keeps the choice in a valid save', () => {
    const m = new GameModel();
    expect(m.battleSpeed).toBe(1);
    m.cycleBattleSpeed();
    expect(m.battleSpeed).toBe(2);
    m.cycleBattleSpeed();
    expect(m.battleSpeed).toBe(4);
    expect(validateSave(JSON.parse(JSON.stringify(m.state)))).toBe(true);
    m.cycleBattleSpeed();
    expect(m.battleSpeed).toBe(1);
    const bad = JSON.parse(JSON.stringify(m.state));
    bad.settings.battleSpeed = 3;
    expect(validateSave(bad)).toBe(false);
  });
});
