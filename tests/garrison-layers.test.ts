import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { garrisonLayers } from '../src/game/garrison-layers';
import { garrisonPoses } from '../src/game/garrison-poses';
import type { NativeScenePose, NativeMeshPose } from '../src/game/native-mesh';
const leaves = (poses: NativeScenePose[]): NativeMeshPose[] =>
  poses.flatMap((p) => ('group' in p ? leaves(p.group) : [p]));
it('partitions all original troop and death frames without losing or altering mesh commands', () => {
  const model = new GameModel();
  model.startBattle(0, true);
  const battle = model.battle!;
  const cases = [
    ...[
      [0, -1],
      [1, -1],
      [1, 0],
      [-1, 0],
      [-1, 1],
      [0, 1],
    ].map(([dx, dy]) => ({ kind: 'dragon' as const, mode: 'fly', frames: 32, dx, dy })),
    { kind: 'dragon' as const, mode: 'die', frames: 143, dx: 1, dy: 0 },
    { kind: 'balloon' as const, mode: 'idle', frames: 37, dx: 1, dy: 0 },
    { kind: 'balloon' as const, mode: 'attack', frames: 34, dx: 1, dy: 0 },
    { kind: 'balloon' as const, mode: 'die', frames: 11, dx: 1, dy: 0 },
  ];
  for (const { kind, mode, frames, dx, dy } of cases) {
    const defender = spawnGarrisonDefender(battle, kind, kind === 'dragon' ? 7 : 8, 1, 10, 10, 0);
    if (kind === 'dragon')
      defender.attacks.push({
        at: 0,
        x: 10,
        y: 10,
        targetId: 1,
        targetX: 10 + dx,
        targetY: 10 + dy,
      });
    if (mode === 'die') {
      defender.hp = 0;
      defender.defeatedAt = 0;
    }
    defender.engaged = mode === 'attack';
    for (let frame = 0; frame < frames; frame++) {
      defender.cooldown = Math.max(0, (33 - frame) / 24);
      battle.elapsed = frame / 24;
      const original = leaves(garrisonPoses(defender, battle));
      const split = garrisonLayers(defender, battle);
      const combined = [...leaves(split.body), ...leaves(split.shadow)].sort((a, b) =>
        a.key.localeCompare(b.key),
      );
      expect(combined).toEqual(original.sort((a, b) => a.key.localeCompare(b.key)));
      expect(new Set(combined.map((p) => p.key)).size).toBe(combined.length);
    }
  }
});
it('keeps original shadow commands separate through death, reduced motion and backward reconstruction', () => {
  const model = new GameModel();
  model.startBattle(0, true);
  const battle = model.battle!;
  const dragon = spawnGarrisonDefender(battle, 'dragon', 7, 1, 10, 10, 0);
  battle.elapsed = 1;
  const alive = garrisonLayers(dragon, battle);
  expect(leaves(alive.shadow)).toHaveLength(2);
  expect(garrisonLayers(dragon, battle, true).shadow.length).toBeGreaterThan(0);
  dragon.hp = 0;
  dragon.defeatedAt = 0;
  expect(leaves(garrisonLayers(dragon, battle).shadow)).toHaveLength(1);
  battle.elapsed = 10;
  expect(garrisonLayers(dragon, battle)).toEqual({ body: [], shadow: [] });
  dragon.hp = dragon.maxHp;
  delete dragon.defeatedAt;
  battle.elapsed = 1;
  expect(garrisonLayers(dragon, battle)).toEqual(alive);
});
