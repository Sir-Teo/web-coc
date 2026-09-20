import { armies, nativeCombatSweep } from './native-campaign-combat-sweep';

// One army per file: see native-campaign-combat-sweep.ts.
nativeCombatSweep(armies.find((a) => a.name === 'air')!);
