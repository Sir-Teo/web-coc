import type { Unit } from './model';
import { isSiege } from './special-troops';
import { nativeUnitRow } from './native-units';
import { flag, list, nativeRow } from './native-data';

/** Source manual self-destruct, independent of the machine's other intrinsic abilities. */
export function siegeSelfDestructAbility(unit: Pick<Unit, 'kind'>, level: number) {
  if (!isSiege(unit.kind)) return undefined;
  return list(nativeUnitRow(unit.kind, level), 'SpecialAbilities').find((name) => {
    const row = nativeRow('abilities', name);
    return flag(row, 'SelfDestruct') && flag(row, 'ActiveAfterPlayerInput');
  });
}
