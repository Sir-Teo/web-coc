import { TROOP_KEYS, SPELL_KEYS, type SpellKind } from '../game/data';
import { TROOP_UNLOCK, SPELL_UNLOCK, spellFactory, troopFacility } from '../game/army-unlocks';

// Presentation order follows facility progression without changing simulation or save order.
export const TROOP_ORDER = [...TROOP_KEYS].sort(
  (a, b) =>
    Number(troopFacility(a) === 'darkbarracks') - Number(troopFacility(b) === 'darkbarracks') ||
    TROOP_UNLOCK[a] - TROOP_UNLOCK[b],
);
export const SPELL_ORDER = [...SPELL_KEYS].sort(
  (a, b) =>
    Number(spellFactory(a) === 'darkspellfactory') - Number(spellFactory(b) === 'darkspellfactory') ||
    SPELL_UNLOCK[a] - SPELL_UNLOCK[b],
);
/** "Spell Factory 4" / "Dark Spell Factory 2" for unlock labels. */
export const spellUnlockLabel = (kind: SpellKind) =>
  `${spellFactory(kind) === 'darkspellfactory' ? 'Dark Spell Factory' : 'Spell Factory'} ${SPELL_UNLOCK[kind]}`;
