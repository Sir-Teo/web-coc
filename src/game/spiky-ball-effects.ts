import type { Battle } from './model';
import type { HeroSetup } from './native-heroes';

/** Original BarbarianKingGearFootball presentation; retained in the full-client catalogs. */
export const SPIKY_BALL_PRESENTATION = {
  projectile: 'BarbarianKingGearFootball',
  trail: 'football_shoot_trail',
  impact: 'Air Defense Barrel Hit',
} as const;
export const spikyBallCarried = (heroes: readonly HeroSetup[]) =>
  heroes.some(
    (hero) => hero.kind === 'king' && hero.items.some((item) => item.slug === 'spiky-ball'),
  );

/** BounceEffect and DestroyedEffect name the same source cue: play once at each contact. */
export function spikyBallSoundEvents(battle: Battle) {
  if (!battle.nativeSpikyBall) return [];
  return (battle.nativeSpikyBallCasts ?? []).flatMap((cast) =>
    cast.shots.map((shot) => ({
      effect: SPIKY_BALL_PRESENTATION.impact,
      key: `${shot.id}:spiky:sound`,
      at: shot.impact,
    })),
  );
}
