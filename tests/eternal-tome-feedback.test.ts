import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { eternalTomeRemaining } from '../src/ui/eternal-tome-feedback';
import { garrisonTomeRecording } from './fixtures/garrison-tome';

it('shows Eternal Tome through its aura and shield linger, then returns to spent', () => {
  const recording = garrisonTomeRecording();
  const viewer = new GameModel();
  expect(viewer.openReplay(recording.data)).toBe(true);
  const remainingAt = (time: number) => {
    viewer.seekReplay(time);
    while (viewer.replay!.seeking) viewer.step(0.05);
    const battle = viewer.battle!;
    const hero = battle.nativeHeroes!.find(({ kind }) => kind === 'warden')!;
    const unit = battle.units.find(({ id }) => id === hero.unitId);
    return eternalTomeRemaining(battle, hero, unit);
  };
  expect(remainingAt(recording.abilityAt - 0.1)).toBe(0);
  expect(remainingAt(recording.primed)).toBeCloseTo(3.1, 1);
  expect(remainingAt(recording.protected)).toBeCloseTo(0.5, 1);
  expect(remainingAt(recording.expired)).toBe(0);
  expect(remainingAt(recording.primed)).toBeCloseTo(3.1, 1);
});
