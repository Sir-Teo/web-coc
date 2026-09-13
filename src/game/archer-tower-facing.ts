import type { Battle, Building } from './model';
import type { TowerArcherFacing } from './archer-tower-art';
import { ARCHER_TOWER } from './archer-tower-stats';

/** Original clips face right. These projected angle sectors are a local interpretation. */
export function towerArcherFacing(dx: number, dy: number): TowerArcherFacing {
  const x = dx - dy,
    y = (dx + dy) / 2;
  return { direction: y < -Math.abs(x) / 2 ? 1 : y > Math.abs(x) / 2 ? 3 : 2, flip: x < 0 };
}

/** Derive facing from simulation-owned targeting, without storing presentation state. */
export function battleTowerArcherFacing(
  tower: Building,
  battle?: Battle | null,
): TowerArcherFacing {
  const idle: TowerArcherFacing = { direction: 3, flip: false };
  if (!battle?.nativeArcherTowers || tower.hp <= 0 || tower.constructing) return idle;
  const target = battle.units.find(
    (unit) => unit.id === battle.defenseTargets[tower.id] && unit.hp > 0,
  );
  if (!target) return idle;
  const dx = target.x - tower.x - 1.5,
    dy = target.y - tower.y - 1.5;
  return Math.hypot(dx, dy) <= ARCHER_TOWER.range ? towerArcherFacing(dx, dy) : idle;
}
