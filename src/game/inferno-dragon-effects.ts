import source from '../../reference/inferno-dragon/beam.json' with { type: 'json' };
import type { Battle } from './model';
import { nativeParticleSampler } from './native-particles';
import { infernoGraph } from './inferno-graph';
import { infernoDragonTransitionKey } from './inferno-dragon-transitions';
import { visualRandom } from './visual-random';

type Row = Record<string, string>;
const effects = source.effects as Record<string, Row[]>;
const particles = source.particles as Record<string, Row[]>;
export const INFERNO_DRAGON_SOUNDS = source.sounds;
export const infernoDragonSample = (path: string) => `inferno-dragon-${path.split('/').at(-1)}`;
const profiles = [source.character.TransitionEffectLv2, source.character.TransitionEffectLv3].map(
  (name) => {
    const effect = effects[name][0];
    return {
      effect: name,
      emitter: effect.ParticleEmitter,
      rows: particles[effect.ParticleEmitter],
      delay: Number(effect.EmitterDelayMs) / 1000,
      layer: effect.IsoLayer,
      sound: effect.Sound,
      soundDelay: Number(effect.SoundDelay) / 1000,
      volume: Number(effect.Volume) / 100,
      pitch: Number(effect.MinPitch) / 100,
      shake: Number(effect.CameraShake),
      shakeDuration: Number(effect.CameraShakeTimeMS) / 1000,
      shakeReplay: effect.CameraShakeInReplay === 'TRUE',
    };
  },
);
export const infernoDragonTransitionProfile = (stage: 1 | 2) => profiles[stage - 1];
let sampler: ReturnType<typeof nativeParticleSampler> | undefined;

/** Detached source bursts: the emitter's StartZ is relative to the recorded ground point. */
export function infernoDragonTransitionPoses(
  battle: Battle | null,
  reduced: boolean,
  iso: (x: number, y: number) => { x: number; y: number },
  elapsed = battle?.elapsed ?? 0,
) {
  if (!battle?.nativeTroopDamageRamp || reduced) return [];
  const particle = (sampler ??= nativeParticleSampler(infernoGraph(), 1.2));
  return (battle.infernoDragonTransitions ?? []).flatMap((event) => {
    const profile = infernoDragonTransitionProfile(event.stage);
    const tick = Math.round(event.at * 20);
    const pose = particle(
      infernoDragonTransitionKey(event),
      profile.emitter,
      profile.rows,
      elapsed - event.at - profile.delay,
      iso(event.x, event.y),
      (slot) => visualRandom(event.unitId, tick, 6000000 + event.stage * 32 + slot),
      profile.layer,
      false,
    );
    return pose ? [pose] : [];
  });
}

/** Source strength/duration; the same local 30 Hz screen mapping as other native shakes. */
export function infernoDragonShake(battle: Battle | null, reduced: boolean, replay = false) {
  const offset = { x: 0, y: 0 };
  if (!battle?.started || battle.finished || reduced) return offset;
  let limit = 0;
  for (const event of battle.infernoDragonTransitions ?? []) {
    const profile = infernoDragonTransitionProfile(event.stage);
    const age = battle.elapsed - event.at;
    if (age <= 0 || age >= profile.shakeDuration - 1e-9 || (replay && !profile.shakeReplay))
      continue;
    const amplitude = profile.shake * 0.32;
    limit = Math.max(limit, amplitude);
    const tick = Math.round(event.at * 20),
      phase = age * 30,
      frame = Math.floor(phase),
      t = phase - frame,
      smooth = t * t * (3 - 2 * t);
    for (const [axis, key] of (['x', 'y'] as const).entries()) {
      const knot = (f: number) =>
        f === 0
          ? 0
          : visualRandom(event.unitId, tick, 7000000 + event.stage * 1000 + f * 2 + axis) * 2 - 1;
      offset[key] +=
        (knot(frame) * (1 - smooth) + knot(frame + 1) * smooth) *
        amplitude *
        (1 - age / profile.shakeDuration);
    }
  }
  offset.x = Math.max(-limit, Math.min(limit, offset.x));
  offset.y = Math.max(-limit, Math.min(limit, offset.y));
  return offset;
}
