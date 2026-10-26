import type { Battle } from './model';

/** Source single-use ballistic mite bodies; each family keeps its replay boundary. */
export const nativeMiteJump = (
  battle: Pick<Battle, 'nativeFrostmites' | 'nativeSingleUseMiteJumps'>,
  kind: string,
) =>
  !!(
    (battle.nativeFrostmites && kind === 'frostmite') ||
    (battle.nativeSingleUseMiteJumps && (kind === 'yetimite' || kind === 'firemite'))
  );

/** Army troop parents warm the matching spawned tier before a defender fight. */
export const MITE_SPAWN_PARENTS = { yetimite: 'yeti', firemite: 'furnace' } as const;
