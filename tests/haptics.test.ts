import { describe, expect, it } from 'vitest';
import { Haptics } from '../src/ui/haptics';
import { GameModel } from '../src/game/model';
import { validateSave } from '../src/game/save';

function recorder(activated = true) {
  const calls: (number | number[])[] = [];
  const haptics = new Haptics(
    (pattern) => {
      calls.push(pattern);
      return true;
    },
    () => activated,
  );
  return { haptics, calls };
}

describe('Haptics', () => {
  it('pulses briefly for a deploy, longer for a destruction, and twice for victory', () => {
    const { haptics, calls } = recorder();
    expect(haptics.supported).toBe(true);
    haptics.pulse('deploy', 0);
    haptics.pulse('destroy', 0);
    haptics.pulse('victory', 0);
    expect(calls).toEqual([8, 25, [30, 60, 30, 60, 60]]);
  });

  it('throttles each kind so a held troop stream is a series of ticks, not a buzz', () => {
    const { haptics, calls } = recorder();
    for (let t = 0; t < 1000; t += 30) haptics.pulse('deploy', t);
    // At most every 90 ms: 0, 90, 180, … 990 out of 34 attempts.
    expect(calls.length).toBe(12);
    // Kinds throttle independently.
    expect(haptics.pulse('destroy', 990)).toBe(true);
  });

  it('stays silent when off, unsupported, or before the first tap', () => {
    const off = recorder();
    off.haptics.enabled = false;
    off.haptics.pulse('deploy', 0);
    expect(off.calls).toEqual([]);

    const early = recorder(false);
    early.haptics.pulse('deploy', 0);
    expect(early.calls).toEqual([]);

    const none = new Haptics(null, () => true);
    expect(none.supported).toBe(false);
    expect(none.pulse('deploy', 0)).toBe(false);
  });

  it('is a saved setting that defaults to on', () => {
    const m = new GameModel();
    expect(m.state.settings.haptics).toBeUndefined();
    m.toggleHaptics();
    expect(m.state.settings.haptics).toBe(false);
    const saved = JSON.parse(JSON.stringify(m.state));
    expect(validateSave(saved)).toBe(true);
    expect(new GameModel(saved).state.settings.haptics).toBe(false);
    m.toggleHaptics();
    expect('haptics' in m.state.settings).toBe(false);
    saved.settings.haptics = 'off';
    expect(validateSave(saved)).toBe(false);
  });
});
