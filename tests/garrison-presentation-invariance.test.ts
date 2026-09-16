import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { garrisonPoses } from '../src/game/garrison-poses';
import { garrisonLayers } from '../src/game/garrison-layers';

/**
 * Frozen before the generic character presentation replaced the Dragon/Balloon-specific
 * pose code: No Flight Zone's original meshes, facing, windup, death and shadow layers
 * must remain byte-identical across this state matrix.
 */
const FROZEN_DIGEST = '9d318c3deabeed7e60044f7e206b0976ec0d7bd38b42b4c6ce0b219804e0294c';

function battle() {
  const model = new GameModel();
  model.startBattle(0, true);
  const b = model.battle!;
  b.units = [];
  return b;
}
it('keeps Dragon 7 and Balloon 8 poses and shadow layers byte-identical', () => {
  const hash = createHash('sha256');
  const add = (label: string, value: unknown) => hash.update(label).update(JSON.stringify(value));
  const b = battle();
  // Dragon: target directions, last-attack fallback, default facing, wing timeline and death.
  for (const reduced of [false, true]) {
    for (let angle = 0; angle < 16; angle++) {
      const dragon = spawnGarrisonDefender(b, 'dragon', 7, 1, 20, 20, 1);
      const dx = Math.cos((angle * Math.PI) / 8) * 3,
        dy = Math.sin((angle * Math.PI) / 8) * 3;
      b.units = [
        {
          id: 7,
          kind: 'giant',
          x: 20 + dx,
          y: 20 + dy,
          hp: 100,
          maxHp: 100,
          cooldown: 0,
          target: null,
          path: [],
          pathAt: 0,
          attacking: false,
        },
      ];
      dragon.target = 7;
      for (const elapsed of [0.5, 1, 1.1, 1.37, 2, 3.5, 14.33]) {
        b.elapsed = elapsed;
        add(`dragon-target:${reduced}:${angle}:${elapsed}`, [
          garrisonPoses(dragon, b, reduced),
          garrisonLayers(dragon, b, reduced),
        ]);
      }
      dragon.target = null;
      dragon.attacks.push({ at: 1, x: 20, y: 20, targetId: 7, targetX: 20 - dy, targetY: 20 + dx });
      b.elapsed = 2.2;
      add(`dragon-last:${reduced}:${angle}`, garrisonLayers(dragon, b, reduced));
      dragon.attacks = [];
      add(`dragon-default:${reduced}:${angle}`, garrisonPoses(dragon, b, reduced));
      dragon.hp = 0;
      for (const since of [0, 0.02, 0.5, 3, 5.9, 5.95, 10]) {
        dragon.defeatedAt = 3;
        b.elapsed = 3 + since;
        add(`dragon-death:${reduced}:${angle}:${since}`, garrisonLayers(dragon, b, reduced));
      }
    }
  }
  // Balloon: idle glow, precharged and repeated windups, action hold and death clamp.
  for (const reduced of [false, true]) {
    const balloon = spawnGarrisonDefender(b, 'balloon', 8, 1, 12, 12, 0.5);
    for (const elapsed of [0.4, 0.5, 0.9, 1.53, 7.1]) {
      b.elapsed = elapsed;
      add(`balloon-idle:${reduced}:${elapsed}`, garrisonLayers(balloon, b, reduced));
    }
    balloon.engaged = true;
    for (const cooldown of [3, 1.4, 1.375, 0.75, 0.3, 0.01, 0]) {
      balloon.cooldown = cooldown;
      b.elapsed = 4;
      add(`balloon-windup:${reduced}:${cooldown}`, garrisonLayers(balloon, b, reduced));
    }
    balloon.attacks.push({ at: 4, x: 12, y: 12, targetId: 7, targetX: 12, targetY: 12 });
    balloon.cooldown = 3;
    for (const since of [0, 0.02, 0.0416, 0.05, 1]) {
      b.elapsed = 4 + since;
      add(`balloon-action:${reduced}:${since}`, garrisonLayers(balloon, b, reduced));
    }
    balloon.hp = 0;
    balloon.defeatedAt = 6;
    for (const since of [0, 0.1, 0.3, 0.42, 2]) {
      b.elapsed = 6 + since;
      add(`balloon-death:${reduced}:${since}`, garrisonPoses(balloon, b, reduced));
    }
    b.elapsed = 0.1;
    add(`balloon-unborn:${reduced}`, garrisonPoses(balloon, b, reduced));
  }
  expect(hash.digest('hex')).toBe(FROZEN_DIGEST);
});
