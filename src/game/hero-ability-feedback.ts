import type { Battle } from './model';
import { fireballProfile } from './fireball-effects';
import { FROST_FLAKE_PRESENTATION } from './frost-flake-effects';
import { DARK_ORB_PRESENTATION } from './dark-orb-effects';
import { ELECTRO_BOOTS_PRESENTATION } from './electro-boots-effects';

/** Match a live ability event to the original activation already owned by battle presentation. */
export function heroAbilityActivation(battle: Battle | null | undefined, id: string | undefined) {
  if (!battle || !id) return;
  const boots = battle.nativeElectroBootsActivations?.find((event) => event.id === id);
  if (battle.nativeElectroBootsPresentation && boots)
    return {
      effect: ELECTRO_BOOTS_PRESENTATION.ActivationEffect,
      key: `${boots.id}:sound`,
      at: boots.at,
    };
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
  const orb = battle.nativeDarkOrbs?.find((shot) => shot.id === id);
  if (battle.nativeDarkOrb && orb)
    return {
      effect: DARK_ORB_PRESENTATION.ActivationEffect,
      visualEffect: DARK_ORB_PRESENTATION.SpawnEffect,
      key: `${orb.id}:sound`,
      at: orb.launched,
    };
}
