import { expect, it } from 'vitest';
import { GameModel, initialSave } from '../src/game/model';
import { parseSaveFile, validateSave } from '../src/game/save';

it('accepts existing villages without volume preferences', () => {
  const save = initialSave();
  expect(save.settings.effectsVolume).toBeUndefined();
  expect(save.settings.musicVolume).toBeUndefined();
  expect(validateSave(save)).toBe(true);
  expect(parseSaveFile(JSON.stringify(save))).not.toBe(null);
});

it.each([0, 0.5, 1])(
  'preserves volume %s through backup parsing and village reconstruction',
  (volume) => {
    const save = initialSave();
    save.settings.effectsVolume = volume;
    save.settings.musicVolume = 1 - volume;
    expect(validateSave(save)).toBe(true);
    const parsed = parseSaveFile(JSON.stringify(save));
    expect(parsed).not.toBe(null);
    const model = new GameModel(parsed!);
    expect(model.state.settings.effectsVolume).toBe(volume);
    expect(model.state.settings.musicVolume).toBe(1 - volume);
  },
);

for (const field of ['effectsVolume', 'musicVolume'] as const)
  it.each([null, '0.5', true, -0.01, 1.01, NaN, Infinity, -Infinity])(
    'rejects malformed ' + field + ' %s',
    (value) => {
      const save = initialSave();
      (save.settings as any)[field] = value;
      expect(validateSave(save)).toBe(false);
    },
  );
