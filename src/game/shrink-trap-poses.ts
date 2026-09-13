import graph from '../../reference/shrink-trap/runtime.json';
import effects from '../../reference/shrink-trap/effects.json';
import { nativeScenePoses, type NativeMeshGraph, type NativeMatrix } from './native-mesh';
import { nativeParticleSampler, type NativeParticlePose } from './native-particles';
import { SHRINK_ART } from './shrink-trap-art';
import { SHRINK_TRAP } from './shrink-trap';
import { visualRandom } from './visual-random';
import type { TrapState } from './traps';
import type { SampleCue } from './sample-audio';

export const SHRINK_GRAPH = graph as unknown as NativeMeshGraph;
export const SHRINK_EFFECTS = effects.effects as Record<string, Record<string, string>[]>;
export const SHRINK_EMITTERS = effects.particles as Record<string, Record<string, string>[]>;
export const SHRINK_SOUNDS = effects.sounds;
export const shrinkSample = (path: string) => `shrink-${path.split('/').at(-1)}`;
const { scale, anchorX, anchorY } = SHRINK_ART;
const bodyRoot: NativeMatrix = [scale, 0, -anchorX * scale, 0, scale, -anchorY * scale];
const ring = SHRINK_GRAPH.clips[SHRINK_GRAPH.exports.shrink_range];
const ringAnimation = SHRINK_GRAPH.clips[ring.children[0]];
export const SHRINK_RING_DURATION = ringAnimation.timeline.length / ringAnimation.fps;
const sample = nativeParticleSampler(SHRINK_GRAPH, scale, {
  reducedEmitters: ['Shrink_deploy_range'],
  staticEmitters: { Shrink_deploy_range: 0 },
  timelineDurations: { shrink_range: SHRINK_RING_DURATION },
});
export function shrinkTrapPoses(
  state: TrapState | undefined,
  elapsed: number,
  reduced = false,
  finished = false,
) {
  const age = state ? Math.max(0, elapsed - state.activatedAt) : 0;
  const poses = nativeScenePoses(
    SHRINK_GRAPH,
    state ? 'Shrink_trap_unarmed' : 'Shrink_trap_armed',
    0,
    {},
    bodyRoot,
  );
  if (state && !finished && !reduced && age < SHRINK_TRAP.delay)
    poses.push(...nativeScenePoses(SHRINK_GRAPH, 'Shrink_trap_trigger', age, {}, bodyRoot));
  return poses;
}
export function shrinkSoundCues(id: number, state: TrapState): SampleCue[] {
  return SHRINK_EFFECTS['Shrink Trap Appear'].flatMap((row, i) =>
    row.Sound
      ? [
          {
            key: `shrink:${id}:appear:${i}`,
            sample: shrinkSample(row.Sound),
            at: state.activatedAt + Number(row.SoundDelay ?? 0) / 1000,
            volume: Number(row.Volume) / 100,
            pitch: Number(row.MinPitch) / 100,
          },
        ]
      : [],
  );
}
export function shrinkEffectPoses(
  id: number,
  state: TrapState,
  elapsed: number,
  point: { x: number; y: number },
  reduced = false,
): NativeParticlePose[] {
  const result: NativeParticlePose[] = [];
  if (!state.shrink) return result;
  const appearAge = elapsed - state.activatedAt,
    reveal = SHRINK_GRAPH.clips[SHRINK_GRAPH.exports.gen_appear_fx];
  if (!reduced && appearAge >= 0 && appearAge < reveal.timeline.length / reveal.fps)
    result.push({
      key: `${id}:appear`,
      emitter: 'gen_appear_fx',
      ...point,
      depth: point.y + 0.1,
      poses: nativeScenePoses(SHRINK_GRAPH, 'gen_appear_fx', appearAge, {}, [
        scale,
        0,
        0,
        0,
        scale,
        0,
      ]),
    });
  for (const [event, effect, at] of [
    ['appear', 'Shrink Trap Appear', state.activatedAt],
    ['deploy', 'Shrink deploy', state.shrink.deployAt],
  ] as const) {
    const rows = SHRINK_EFFECTS[effect];
    for (const [emitterIndex, row] of rows.entries()) {
      const name = row.ParticleEmitter;
      if (!name) continue;
      const particles = SHRINK_EMITTERS[name],
        first = particles[0];
      const age = elapsed - at - Number(row.EmitterDelayMs ?? 0) / 1000;
      if (age < 0 || age >= (Number(first.EmissionTime) + Number(first.MaxLife)) / 1000) continue;
      const count = Number(first.ParticleCount);
      for (let i = 0; i < count; i++) {
        const pose = sample(
          `${id}:${event}:${emitterIndex}:${i}`,
          name,
          particles,
          age - ((Number(first.EmissionTime) / 1000) * i) / count,
          point,
          (slot) =>
            visualRandom(id, event === 'deploy' ? 1 : 0, emitterIndex * 1000 + i * 16 + slot),
          row.IsoLayer ?? rows[0].IsoLayer,
          reduced,
        );
        if (pose) result.push(pose);
      }
    }
  }
  return result;
}
