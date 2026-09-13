import { expect, it } from 'vitest';
import native from '../reference/garrison/native.json';
import { GameModel } from '../src/game/model';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { balloonAttackPose, BALLOON_ACTION_TIME } from '../src/game/garrison-poses';

const balloon = () => {
  const model = new GameModel();
  model.startBattle(0, true);
  return spawnGarrisonDefender(model.battle!, 'balloon', 8, 1, 10, 10, 0);
};
it('aligns the source final action frame with damage instead of starting the windup afterward', () => {
  expect(
    native.animations['Balloon Goblin8'].rows.find((r) => r.Name === 'attack')?.ActionFrame,
  ).toBe('34');
  expect(BALLOON_ACTION_TIME).toBe(33 / 24);
  const defender = balloon();
  defender.engaged = true;
  defender.cooldown = 3;
  expect(balloonAttackPose(defender, 0)).toBeNull();
  defender.cooldown = BALLOON_ACTION_TIME;
  expect(balloonAttackPose(defender, 0)?.time).toBe(0);
  defender.cooldown = 0.75;
  expect(balloonAttackPose(defender, 0)?.time).toBe(15 / 24);
  defender.cooldown = 0.05;
  expect(balloonAttackPose(defender, 0)?.time).toBeCloseTo(33 / 24 - 0.05);
  defender.cooldown = 3;
  defender.attacks.push({ at: 2, x: 10, y: 10, targetId: 1, targetX: 10, targetY: 10 });
  expect(balloonAttackPose(defender, 2)?.time).toBe(BALLOON_ACTION_TIME);
  expect(balloonAttackPose(defender, 2.02)?.time).toBe(BALLOON_ACTION_TIME);
  expect(balloonAttackPose(defender, 2.05)).toBeNull();
});
it('freezes with the combat cooldown, cancels on disengagement and is pure across seeks', () => {
  const defender = balloon();
  defender.engaged = true;
  defender.cooldown = 0.4;
  defender.stunnedUntil = 20;
  const before = structuredClone(defender);
  expect(balloonAttackPose(defender, 10)).toEqual(balloonAttackPose(defender, 12));
  expect(balloonAttackPose(defender, 10, true)).toBeNull();
  expect(defender).toEqual(before);
  delete defender.engaged;
  expect(balloonAttackPose(defender, 10)).toBeNull();
});
