import { nativeSuperLicence, nativeSuperLicences, num, text } from './native-data';
import { TROOP_SOURCE } from './native-units';
import source from '../../reference/full-client/progression.json' with { type: 'json' };
import type { TroopKind } from './data';
export const isSiege = (kind: string) =>
  (source.troopDefs as Record<string, { ProductionBuilding?: string }>)[kind]
    ?.ProductionBuilding === 'Siege Workshop';
export const superLicence = (kind: TroopKind) =>
  nativeSuperLicences()
    .map(nativeSuperLicence)
    .find((row) => text(row, 'Replacement') === TROOP_SOURCE[kind]);
export function superOriginal(kind: TroopKind): TroopKind | undefined {
  const name = text(superLicence(kind), 'Original');
  return Object.entries(TROOP_SOURCE).find(([, value]) => value === name)?.[0] as
    TroopKind | undefined;
}
export const superMinimum = (kind: TroopKind) => num(superLicence(kind), 'MinOriginalLevel');

export const superLevelOffset = (kind: TroopKind) =>
  Number((source.troopDefs[kind] as Record<string, string>).VisualLevel || 1) - 1;
