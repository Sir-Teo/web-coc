import { expect, it } from 'vitest';
import { archerTowerBattle } from './fixtures/archer-tower-battle';
import { battleTowerArcherFacing, towerArcherFacing } from '../src/game/archer-tower-facing';
import {
  archerTowerComposition,
  archerTowerSource,
  towerArcherPoses,
} from '../src/game/archer-tower-art';

export const directions = [
  { dx: -1, dy: -3, direction: 1, flip: false },
  { dx: -3, dy: -1, direction: 1, flip: true },
  { dx: 3, dy: -3, direction: 2, flip: false },
  { dx: -3, dy: 3, direction: 2, flip: true },
  { dx: 3, dy: 1, direction: 3, flip: false },
  { dx: 1, dy: 3, direction: 3, flip: true },
] as const;
it('uses all six original/mirrored views without reflecting the tower or roof attachment', () => {
  for (let level = 1; level <= 21; level++) {
    const base = archerTowerComposition(level, 'ready', 0.25);
    for (const { dx, dy, direction, flip } of directions) {
      const facing = towerArcherFacing(dx, dy);
      expect(facing).toEqual({ direction, flip });
      const composed = archerTowerComposition(level, 'ready', 0.25, false, facing);
      expect(composed.body).toEqual(base.body);
      expect(composed.residents).toEqual(
        towerArcherPoses(level, 'idle', direction, 0.25, [
          flip ? -1 : 1,
          0,
          0,
          0,
          1,
          60 - Number(archerTowerSource(level).DefenderZ) * 0.5,
        ]),
      );
    }
  }
});
it('tracks only the live in-range assigned target and reconstructs facing without state changes', () => {
  const model = archerTowerBattle(),
    battle = model.battle!;
  const tower = battle.buildings.find((b) => b.kind === 'archertower')!;
  const target = battle.units[0];
  battle.defenseTargets[tower.id] = target.id;
  for (const { dx, dy, direction, flip } of directions) {
    target.x = tower.x + 1.5 + dx;
    target.y = tower.y + 1.5 + dy;
    const before = JSON.stringify(battle);
    expect(battleTowerArcherFacing(tower, battle)).toEqual({ direction, flip });
    expect(battleTowerArcherFacing(tower, JSON.parse(before))).toEqual({ direction, flip });
    expect(JSON.stringify(battle)).toBe(before);
  }
  const idle = { direction: 3, flip: false };
  target.hp = 0;
  expect(battleTowerArcherFacing(tower, battle)).toEqual(idle);
  target.hp = 1;
  target.x = tower.x + 50;
  expect(battleTowerArcherFacing(tower, battle)).toEqual(idle);
  target.x = tower.x;
  delete battle.nativeArcherTowers;
  expect(battleTowerArcherFacing(tower, battle)).toEqual(idle);
  expect(battleTowerArcherFacing(tower, null)).toEqual(idle);
});
