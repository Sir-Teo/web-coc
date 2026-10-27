import source from '../../reference/dark-orb/effects.json' with { type: 'json' };
import type { Battle } from './model';
import type { HeroSetup } from './native-heroes';
import type { NativeEffectEvent } from './native-effects';

export const DARK_ORB_PRESENTATION = source.profile;
export const darkOrbCarried = (heroes: readonly HeroSetup[]) =>
  heroes.some(
    (hero) => hero.kind === 'prince' && hero.items.some((item) => item.slug === 'dark-orb'),
  );

export function darkOrbEffectEvents(
  battle: Battle,
  iso: (x: number, y: number) => { x: number; y: number },
  airLift: number,
  duration: (name: string) => number | undefined,
): NativeEffectEvent[] {
  if (!battle.nativeDarkOrb) return [];
  const effect = source.profile.HitEffect;
  return (battle.nativeDarkOrbs ?? []).flatMap((shot) =>
    shot.hit
      .filter(
        (hit) =>
          hit.at <= battle.elapsed + 1e-9 && battle.elapsed - hit.at <= (duration(effect) ?? 30),
      )
      .map((hit) => ({
        key: `${shot.id}:contact:${hit.target.building ? 'b' : 'd'}:${hit.target.id}`,
        effect,
        at: hit.at,
        ground: iso(hit.x, hit.y),
        ...(hit.air ? { lift: airLift } : {}),
        nestedTimelines: true,
      })),
  );
}
