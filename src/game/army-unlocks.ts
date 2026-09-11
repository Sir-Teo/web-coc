import type { Building } from './model';
import type { TroopKind, SpellKind } from './data';

/** Supported Home Village unlocks. References: docs/ARMY-UNLOCKS.md. */
export const TROOP_UNLOCK: Record<TroopKind, number> = {
  swordsman: 1, archer: 2, giant: 3, goblin: 4, wallbreaker: 5, balloon: 6, wizard: 7,
};
export const SPELL_UNLOCK: Record<SpellKind, number> = { lightning: 1, heal: 2, rage: 3 };

export function facilityLevel(buildings: Building[], kind: 'barracks' | 'spellfactory') {
  return buildings.reduce((level, b) =>
    b.kind === kind && !b.constructing ? Math.max(level, b.level) : level, 0);
}
