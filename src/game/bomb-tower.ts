import { TROOPS } from './data';
import type { Battle, Building, FX } from './model';

/** Public client values. See docs/BOMB-TOWER.md for sources and timing assumptions. */
export const BOMB_TOWER = {
  speed: 8,
  deathRadius: 2.75,
  deathDelay: 1,
  deathDamage: [150, 180],
} as const;
export const bombTowerDeathDamage = (level: number) => BOMB_TOWER.deathDamage[level - 1] ?? 180;
export interface DeathBomb {
  sourceId: number;
  x: number;
  y: number;
  armedAt: number;
  impact: number;
  damage: number;
  resolved: boolean;
  cancelled?: boolean;
}

export function primeDeathBomb(
  battle: Battle,
  tower: Building,
  power: number,
  at = battle.elapsed,
) {
  if (
    tower.kind !== 'bombtower' ||
    tower.constructing ||
    tower.upgradeEnd ||
    battle.deathBombs?.[tower.id]
  )
    return;
  (battle.deathBombs ??= {})[tower.id] = {
    sourceId: tower.id,
    x: tower.x + 1.5,
    y: tower.y + 1.5,
    armedAt: at,
    impact: at + BOMB_TOWER.deathDelay,
    damage: power,
    resolved: false,
  };
}

export function stepDeathBombs(battle: Battle, effect: (fx: FX) => void) {
  if (battle.finished) return;
  for (const bomb of Object.values(battle.deathBombs ?? {}).sort(
    (a, b) => a.impact - b.impact || a.sourceId - b.sourceId,
  )) {
    if (bomb.resolved || bomb.cancelled || bomb.impact > battle.elapsed + 1e-9) continue;
    bomb.resolved = true;
    for (const unit of battle.units)
      if (
        unit.hp > 0 &&
        !TROOPS[unit.kind].flying &&
        Math.hypot(unit.x - bomb.x, unit.y - bomb.y) <= BOMB_TOWER.deathRadius
      )
        unit.hp -= bomb.damage;
    effect({
      type: 'blast',
      weapon: 'towerbomb',
      sourceId: bomb.sourceId,
      x: bomb.x,
      y: bomb.y,
      radius: BOMB_TOWER.deathRadius,
    });
  }
}

/** The Bomber is a roof actor; frames follow the weapon's battle-time cooldown. */
export function bomberFrame(tower: Building, battle: Battle | null, reduced: boolean) {
  if (
    !battle ||
    battle.finished ||
    reduced ||
    tower.upgradeEnd ||
    tower.constructing ||
    (battle.defenseStuns[tower.id] ?? 0) > battle.elapsed ||
    battle.defenseTargets[tower.id] === undefined
  )
    return 0;
  const target = battle.units.find((u) => u.id === battle.defenseTargets[tower.id] && u.hp > 0);
  if (
    !target ||
    TROOPS[target.kind].flying ||
    Math.hypot(target.x - tower.x - 1.5, target.y - tower.y - 1.5) > 6
  )
    return 0;
  const age = 1.1 - tower.cooldown;
  if (age >= 0 && age < 0.12) return 2;
  if (age >= 0 && age < 0.27) return 3;
  if (tower.cooldown > 0 && tower.cooldown < 0.16) return 1;
  return 0;
}
