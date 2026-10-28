import type { TroopKind } from './data';
import { nativeRow, text } from './native-data';
import { unitKindForName } from './native-units';

/** BunkerTroops is a fixed two-entry array across rows 1–2, independent of unit level. */
export const SIEGE_BARRACKS_KINDS = [1, 2].map((row) =>
  unitKindForName(text(nativeRow('characters', 'Siege Barracks', row), 'BunkerTroops')),
) as [TroopKind, TroopKind];
