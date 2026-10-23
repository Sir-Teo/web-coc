import { BUILDINGS, isTrap } from './data';
import { distanceSquared2D } from './distance';
import { MAP_SIZE } from './grid';
import { nativeGlobal } from './native-data';
import type { Battle } from './model';
import type { GarrisonDefender } from './defenders';

export interface DefenderPoisonArea {
  id: number;
  x: number;
  y: number;
  radius: number;
  until: number;
}

/** Remember each cloud through its native boost deadline, even after its final pulse. */
export function recordPoisonArea(defender: GarrisonDefender, area: DefenderPoisonArea, at: number) {
  const poison = defender.poison;
  if (!poison) return;
  poison.areas = (poison.areas ?? []).filter((old) => old.id !== area.id && old.until > at);
  poison.areas.push(area);
}

/**
 * Local exit choice: nearest clear boundary among sixteen directions per active cloud.
 * Overlaps are avoided together; the invulnerable Builder has no avoidance behavior.
 */
export function poisonAvoidanceTarget(battle: Battle, defender: GarrisonDefender) {
  if (!battle.nativePoisonAvoidance || !nativeGlobal('USE_POISON_AVOIDANCE')) return undefined;
  const areas = defender.poison?.areas?.filter((area) => area.until > battle.elapsed);
  if (
    !areas?.length ||
    !areas.some(
      (area) => distanceSquared2D(defender.x - area.x, defender.y - area.y) <= area.radius ** 2,
    )
  )
    return undefined;
  let best: { x: number; y: number } | undefined;
  let bestDistance = Infinity;
  for (const area of areas) {
    const dx = defender.x - area.x;
    const dy = defender.y - area.y;
    const angle = dx || dy ? Math.atan2(dy, dx) : ((Math.abs(defender.id) % 16) * Math.PI) / 8;
    for (let direction = 0; direction < 16; direction++) {
      const facing = angle + (direction * Math.PI) / 8;
      const x = area.x + Math.cos(facing) * (area.radius + 0.125);
      const y = area.y + Math.sin(facing) * (area.radius + 0.125);
      if (x < 0.5 || y < 0.5 || x > MAP_SIZE - 0.5 || y > MAP_SIZE - 0.5) continue;
      if (areas.some((cloud) => distanceSquared2D(x - cloud.x, y - cloud.y) <= cloud.radius ** 2))
        continue;
      if (
        defender.mode !== 'air' &&
        battle.buildings.some((building) => {
          const size = BUILDINGS[building.kind].size;
          return (
            building.hp > 0 &&
            building.kind !== 'wall' &&
            !isTrap(building.kind) &&
            x >= building.x &&
            x < building.x + size &&
            y >= building.y &&
            y < building.y + size
          );
        })
      )
        continue;
      const distance = distanceSquared2D(x - defender.x, y - defender.y);
      if (distance < bestDistance - 1e-9) {
        best = { x, y };
        bestDistance = distance;
      }
    }
  }
  return best;
}
