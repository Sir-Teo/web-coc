import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { petAnimationRecording } from './fixtures/pet-animation';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

it('reconstructs actual poisoned pet attack cooldowns through portable backward seeks', () => {
  const { data, snapshots, petId, base, interval, launched } = petAnimationRecording();
  expect(interval).toBeGreaterThan(base);
  const viewer = new GameModel();
  expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
  for (const snapshot of [...snapshots].reverse()) {
    viewer.seekReplay(snapshot.at);
    while (viewer.replay!.seeking) viewer.step(0.05);
    expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
    const pet = viewer.battle!.units.find((u) => u.id === petId)!;
    expect(pet.native?.effects?.poison).toBeDefined();
    expect(pet.cooldown).toBeGreaterThan(base);
    expect(interval - pet.cooldown).toBeCloseTo(snapshot.at - launched, 9);
  }
});
