import { BUILDINGS } from './data';
import type { Building } from './model';
import { nativeGearedWeapon, nativeWeapon } from './native-defense-stats';
import { spellTowerRange } from './spell-tower-stats';
import { xbowRange } from './xbow-stats';

type RangeBuilding = Pick<
  Building,
  | 'kind'
  | 'level'
  | 'infernoMode'
  | 'xbowMode'
  | 'spellMode'
  | 'spellTowerWeapon'
  | 'gearMode'
  | 'geared'
  | 'supercharge'
>;

/** Attack reach for selection rings and scouting labels; trap triggers stay with the caller. */
export function buildingRange(tower: RangeBuilding): number | undefined {
  if (tower.kind === 'inferno') return tower.infernoMode === 'multi' ? 10 : 9;
  if (tower.kind === 'xbow') return xbowRange(tower.xbowMode);
  if (tower.kind === 'spelltower') return spellTowerRange(tower);
  if (
    tower.geared &&
    (tower.kind === 'cannon' || tower.kind === 'archertower' || tower.kind === 'mortar')
  )
    return nativeGearedWeapon(tower.kind, tower.level, tower.supercharge).range;
  if (tower.kind === 'multigeartower')
    return (
      nativeWeapon('multigeartower', tower.level, {
        mode: tower.gearMode ?? 'long',
        supercharge: tower.supercharge,
      })?.range ?? BUILDINGS.multigeartower.range
    );
  return BUILDINGS[tower.kind].range;
}
