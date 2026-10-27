import source from '../../reference/electro-boots/effects.json' with { type: 'json' };
import type { Battle } from './model';
import type { HeroSetup } from './native-heroes';
import type { NativeEffectEvent } from './native-effects';
import { visualRandom } from './visual-random';

export const ELECTRO_BOOTS_PRESENTATION = source.profile;
export const electroBootsCarried = (heroes: readonly HeroSetup[]) =>
  heroes.some(
    (hero) => hero.kind === 'champion' && hero.items.some((item) => item.slug === 'electro-boots'),
  );

export function electroBootsEffectEvents(
  battle: Battle,
  iso: (x: number, y: number) => { x: number; y: number },
  duration: (name: string) => number | undefined,
): NativeEffectEvent[] {
  if (!battle.nativeElectroBootsPresentation) return [];
  const effect = source.profile.ActivationEffect;
  return (battle.nativeElectroBootsActivations ?? [])
    .filter(
      (event) =>
        event.at <= battle.elapsed + 1e-9 && battle.elapsed - event.at <= (duration(effect) ?? 30),
    )
    .map((event) => ({
      key: `${event.id}:activation`,
      effect,
      at: event.at,
      ground: iso(event.x, event.y),
    }));
}

export function electroBootsSoundEvents(battle: Battle) {
  if (!battle.nativeElectroBootsPresentation) return [];
  return (battle.nativeElectroBootsActivations ?? []).map((event) => ({
    effect: source.profile.ActivationEffect,
    key: `${event.id}:sound`,
    at: event.at,
  }));
}

export const ELECTRO_BOOTS_SHAKE = {
  strength: Number(source.shake.CameraShake),
  duration: Number(source.shake.CameraShakeTimeMS) / 1000,
  replay: source.shake.CameraShakeInReplay === 'TRUE',
};

/** Source deployment impulse, using the shared local 30 Hz screen mapping and decay. */
export function electroBootsShake(
  battle: Battle | null,
  reduced: boolean,
  replay = false,
  elapsed = battle?.elapsed ?? 0,
) {
  const offset = { x: 0, y: 0 };
  if (
    !battle?.nativeElectroBootsPresentation ||
    !battle.started ||
    reduced ||
    (replay && !ELECTRO_BOOTS_SHAKE.replay)
  )
    return offset;
  const amplitude = ELECTRO_BOOTS_SHAKE.strength * 0.32;
  const events = [...(battle.nativeElectroBootsActivations ?? [])].sort(
    (a, b) => a.at - b.at || a.sourceId - b.sourceId,
  );
  for (const event of events) {
    const age = elapsed - event.at;
    if (age <= 0 || age >= ELECTRO_BOOTS_SHAKE.duration - 1e-9) continue;
    const tick = Math.round(event.at * 20),
      phase = age * 30,
      frame = Math.floor(phase),
      t = phase - frame,
      smooth = t * t * (3 - 2 * t);
    for (const [axis, key] of (['x', 'y'] as const).entries()) {
      const knot = (f: number) =>
        f === 0 ? 0 : visualRandom(event.sourceId, tick, 8600000 + f * 2 + axis) * 2 - 1;
      offset[key] +=
        (knot(frame) * (1 - smooth) + knot(frame + 1) * smooth) *
        amplitude *
        (1 - age / ELECTRO_BOOTS_SHAKE.duration);
    }
  }
  offset.x = Math.max(-amplitude, Math.min(amplitude, offset.x));
  offset.y = Math.max(-amplitude, Math.min(amplitude, offset.y));
  return offset;
}
