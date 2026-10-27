import source from '../../reference/frost-flake/effects.json' with { type: 'json' };
import type { Battle } from './model';
import type { HeroSetup } from './native-heroes';
import type { NativeEffectEvent } from './native-effects';

export const FROST_FLAKE_PRESENTATION = source.profile;
export const frostFlakeCarried = (heroes: readonly HeroSetup[]) =>
  heroes.some(
    (hero) => hero.kind === 'champion' && hero.items.some((item) => item.slug === 'frost-charm'),
  );
export const frostFlakeSoundEffects = [
  source.profile.ActivationEffect,
  source.profile.DestroyedEffect,
];

export function frostFlakeEffectEvents(
  battle: Battle,
  iso: (x: number, y: number) => { x: number; y: number },
  duration: (name: string) => number | undefined,
): NativeEffectEvent[] {
  if (!battle.nativeFrostFlake) return [];
  const effect = source.profile.ActivationEffect;
  return (battle.nativeFrostFlakeCasts ?? [])
    .filter(
      (cast) =>
        cast.at <= battle.elapsed + 1e-9 && battle.elapsed - cast.at <= (duration(effect) ?? 30),
    )
    .map((cast) => ({
      key: `${cast.id}:activation`,
      effect,
      at: cast.at,
      ground: iso(cast.x, cast.y),
      nestedTimelines: true,
    }));
}

export function frostFlakeSoundEvents(battle: Battle) {
  if (!battle.nativeFrostFlake) return [];
  return (battle.nativeFrostFlakeCasts ?? []).flatMap((cast) => [
    { effect: source.profile.ActivationEffect, key: `${cast.id}:sound`, at: cast.at },
    ...cast.shots.map((shot) => ({
      effect: source.profile.DestroyedEffect,
      key: `${shot.id}:sound`,
      at: shot.impact,
    })),
  ]);
}
