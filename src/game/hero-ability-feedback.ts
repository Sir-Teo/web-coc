import type { Battle } from './model';
import { fireballProfile } from './fireball-effects';
import { FROST_FLAKE_PRESENTATION } from './frost-flake-effects';

/** Match a live ability event to the original activation already owned by battle presentation. */
export function heroAbilityActivation(battle: Battle | null | undefined, id: string | undefined) {
  if (!battle || !id) return;
  const frost = battle.nativeFrostFlakeCasts?.find((cast) => cast.id === id);
  if (battle.nativeFrostFlake && frost)
    return {
      effect: FROST_FLAKE_PRESENTATION.ActivationEffect,
      key: `${frost.id}:sound`,
      at: frost.at,
    };
  const fireball = battle.nativeFireballs?.find((shot) => shot.id === id);
  const level = fireball?.native?.fireball?.level;
  const profile = level === undefined ? undefined : fireballProfile(level);
  if (battle.nativeWardenFireball && fireball && profile)
    return {
      effect: profile.ActivationEffect,
      key: `${fireball.id}:fireball:sound`,
      at: fireball.launched,
    };
}
