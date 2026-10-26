import { isDefense } from './data';
import { activeAsDefense } from './native-defenses';
import type { Battle, Building } from './model';

/** Source activated weapons join the Defense class; historical recordings use static kinds. */
export const preferredDefense = (battle: Battle, building: Building, at = battle.elapsed) =>
  battle.nativeActivatedPreference
    ? activeAsDefense(battle, building, at)
    : isDefense(building.kind);
