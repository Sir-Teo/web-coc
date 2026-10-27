import source from '../../reference/meteor-staff/effects.json' with { type: 'json' };
import type { Battle } from './model';
import { visualRandom } from './visual-random';

export const METEOR_STAFF_SPELL = source.spell;
export const METEOR_STAFF_PROFILES = source.spellLevels;
export const METEOR_STAFF_CARRIED = { hero: 'prince', slug: 'meteor-staff' };
export const METEOR_STAFF_SHAKE = {
  strength: Number(source.shake.CameraShake),
  duration: Number(source.shake.CameraShakeTimeMS) / 1000,
  replay: source.shake.CameraShakeInReplay === 'TRUE',
};

/** The original fall cue covers the periodic cast; its attached aura covers generated hit art. */
export function meteorStaffActivation(battle: Battle, id: string) {
  if (!id.startsWith('meteor-staff:') || !battle.nativeSpellArt?.includes(METEOR_STAFF_SPELL))
    return;
  const cast = battle.nativeSpellCastHistory?.find(
    (cast) => cast.name === METEOR_STAFF_SPELL && `meteor-staff:${cast.id}` === id,
  );
  const profile = cast && METEOR_STAFF_PROFILES.find((row) => row.level === cast.level);
  if (cast && profile)
    return {
      effect: profile.PreDeployEffect,
      visualEffect: profile.ActivationEffect,
      key: `spell:${cast.id}:preDeploy`,
      at: cast.castAt,
    };
}

/** Source impact impulse begins at the visual deployment, independently of the later damage pulse. */
export function meteorStaffShake(
  battle: Battle | null,
  reduced: boolean,
  replay = false,
  elapsed = battle?.elapsed ?? 0,
) {
  const offset = { x: 0, y: 0 };
  if (
    !battle?.nativeSpellArt?.includes(METEOR_STAFF_SPELL) ||
    !battle.started ||
    reduced ||
    (replay && !METEOR_STAFF_SHAKE.replay)
  )
    return offset;
  const amplitude = METEOR_STAFF_SHAKE.strength * 0.32;
  const casts = (battle.nativeSpellCastHistory ?? [])
    .filter((cast) => cast.name === METEOR_STAFF_SPELL)
    .sort((a, b) => a.castAt - b.castAt || a.id - b.id);
  for (const cast of casts) {
    const profile = METEOR_STAFF_PROFILES.find((row) => row.level === cast.level);
    if (!profile) continue;
    const at = cast.castAt + profile.deploySeconds,
      age = elapsed - at;
    if (at > battle.elapsed + 1e-9 || age <= 0 || age >= METEOR_STAFF_SHAKE.duration - 1e-9)
      continue;
    const tick = Math.round(at * 20),
      phase = age * 30,
      frame = Math.floor(phase),
      t = phase - frame,
      smooth = t * t * (3 - 2 * t);
    for (const [axis, key] of (['x', 'y'] as const).entries()) {
      const knot = (f: number) =>
        f === 0 ? 0 : visualRandom(cast.owner ?? cast.id, tick, 8700000 + f * 2 + axis) * 2 - 1;
      offset[key] +=
        (knot(frame) * (1 - smooth) + knot(frame + 1) * smooth) *
        amplitude *
        (1 - age / METEOR_STAFF_SHAKE.duration);
    }
  }
  offset.x = Math.max(-amplitude, Math.min(amplitude, offset.x));
  offset.y = Math.max(-amplitude, Math.min(amplitude, offset.y));
  return offset;
}
