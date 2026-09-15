import { TROOP_KEYS, SPELL_KEYS } from '../game/data';
import { TROOP_UNLOCK, SPELL_UNLOCK, troopFacility } from '../game/army-unlocks';

// Presentation order follows facility progression without changing simulation or save order.
export const TROOP_ORDER = [...TROOP_KEYS].sort(
  (a, b) =>
    Number(troopFacility(a) === 'darkbarracks') - Number(troopFacility(b) === 'darkbarracks') ||
    TROOP_UNLOCK[a] - TROOP_UNLOCK[b],
);
export const SPELL_ORDER = [...SPELL_KEYS].sort((a, b) => SPELL_UNLOCK[a] - SPELL_UNLOCK[b]);
