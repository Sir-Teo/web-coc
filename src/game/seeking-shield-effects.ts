import type { Battle } from './model';
import type { HeroSetup } from './native-heroes';

export const SEEKING_SHIELD_PRESENTATION = {
  projectile: 'AmazonQueen_shield',
  trail: 'shield_trail_glow',
  destroyed: 'trollBoulder_destroyed',
} as const;
export const seekingShieldCarried = (heroes: readonly HeroSetup[]) =>
  heroes.some(
    (hero) => hero.kind === 'champion' && hero.items.some((item) => item.slug === 'seeking-shield'),
  );

/** This row declares only a destroyed effect, with no separate intermediate bounce effect. */
export function seekingShieldSoundEvents(battle: Battle) {
  if (!battle.nativeSeekingShield) return [];
  return (battle.nativeSeekingShieldCasts ?? []).flatMap((cast) =>
    cast.shots
      .filter((shot) => !shot.native?.seekingShield?.continues)
      .map((shot) => ({
        effect: SEEKING_SHIELD_PRESENTATION.destroyed,
        key: `${shot.id}:shield:sound`,
        at: shot.impact,
      })),
  );
}
