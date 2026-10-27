import source from '../../reference/fireball/effects.json' with { type: 'json' };
import { fireballProfile } from './fireball-effects';
import type { Battle } from './model';
import { visualRandom } from './visual-random';

const rows = source.shakes as Record<
  string,
  {
    CameraShake: string;
    CameraShakeTimeMS: string;
    CameraShakeInReplay: string;
  }
>;
export function fireballShakeProfile(level: number) {
  const effect = fireballProfile(level)?.HitEffect,
    row = effect && rows[effect];
  return row
    ? {
        strength: Number(row.CameraShake),
        duration: Number(row.CameraShakeTimeMS) / 1000,
        replay: row.CameraShakeInReplay === 'TRUE',
      }
    : undefined;
}

/** Original explosion impulse, using the shared local 30 Hz screen mapping and decay. */
export function fireballShake(
  battle: Battle | null,
  reduced: boolean,
  replay = false,
  elapsed = battle?.elapsed ?? 0,
) {
  const offset = { x: 0, y: 0 };
  if (!battle?.nativeWardenFireball || !battle.started || reduced) return offset;
  let limit = 0;
  const shots = battle.nativeFireballs ?? [];
  const ordered =
    shots.length < 2
      ? shots
      : [...shots].sort(
          (a, b) =>
            a.impact - b.impact ||
            a.sourceId - b.sourceId ||
            (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
        );
  for (const shot of ordered) {
    // End Battle can cancel an airborne packet; presentation time must not invent its area hit.
    if (battle.finished && shot.impact > battle.elapsed + 1e-9) continue;
    const level = shot.native?.fireball?.level;
    const profile = level === undefined ? undefined : fireballShakeProfile(level);
    const age = elapsed - shot.impact;
    if (!profile || (replay && !profile.replay) || age <= 0 || age >= profile.duration - 1e-9)
      continue;
    const amplitude = profile.strength * 0.32;
    limit = Math.max(limit, amplitude);
    const tick = Math.round(shot.impact * 20),
      phase = age * 30,
      frame = Math.floor(phase),
      t = phase - frame,
      smooth = t * t * (3 - 2 * t);
    for (const [axis, key] of (['x', 'y'] as const).entries()) {
      const knot = (f: number) =>
        f === 0 ? 0 : visualRandom(shot.sourceId, tick, 8500000 + f * 2 + axis) * 2 - 1;
      offset[key] +=
        (knot(frame) * (1 - smooth) + knot(frame + 1) * smooth) *
        amplitude *
        (1 - age / profile.duration);
    }
  }
  offset.x = Math.max(-limit, Math.min(limit, offset.x));
  offset.y = Math.max(-limit, Math.min(limit, offset.y));
  return offset;
}
