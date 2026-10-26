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
export const MITE_SPAWN_PARENTS = {
  yetimite: 'yeti',
  firemite: 'furnace',
  electromite: 'superyeti',
  meteormite: 'meteorgolem',
} as const;
/** Every carried family retains the replay boundary that introduced its summon prefetch. */
export function carriedMiteArt(battle: Battle | null | undefined) {
  if (!battle) return [];
  return (Object.keys(MITE_SPAWN_PARENTS) as (keyof typeof MITE_SPAWN_PARENTS)[]).filter((kind) => {
    const active =
      kind === 'electromite'
        ? battle.nativeElectromites
        : kind === 'meteormite'
          ? battle.nativeMeteorThrows
          : battle.nativeSingleUseMiteJumps;
    return active && (battle.carriedArmy?.[MITE_SPAWN_PARENTS[kind]] ?? 0) > 0;
  });
}
