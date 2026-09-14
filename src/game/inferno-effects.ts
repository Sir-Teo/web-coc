import source from '../../reference/inferno/native.json' with { type: 'json' };
import { INFERNO_GRAPH } from './inferno-art';
import { nativeParticleSampler, type NativeParticlePose } from './native-particles';
import { visualRandom } from './visual-random';
import type { Battle } from './model';

type Row = Record<string, string>;
const effects = source.effects['Dark Tower Hit'] as Row[];
const emitters = Object.fromEntries(
  Object.entries(source.particles).map(([name, rows]) => [
    name,
    rows.map((row) => ({ ...rows[0], ...row }) as Row),
  ]),
);
const particle = nativeParticleSampler(INFERNO_GRAPH, 1.2);

/** Detached source hit emitters, seeded by immutable pulse tick and beam slot. */
export function infernoImpactPoses(
  battle: Battle | null,
  reduced: boolean,
  iso: (x: number, y: number) => { x: number; y: number },
): NativeParticlePose[] {
  if (!battle || reduced || battle.finished) return [];
  const result: NativeParticlePose[] = [];
  for (const [id, state] of Object.entries(battle.infernos ?? {}))
    for (const hit of state.hits) {
      const tick = Math.round((hit.at * 1000) / 64);
      const point = iso(hit.targetX, hit.targetY);
      const origin = { x: point.x, y: point.y - (hit.toAir ? 46 : 0) };
      effects.forEach((effect, emitterIndex) => {
        const name = effect.ParticleEmitter;
        const rows = emitters[name],
          row = rows[0];
        const age = battle.elapsed - hit.at - Number(effect.EmitterDelayMs ?? 0) / 1000;
        const duration = Number(row.EmissionTime) / 1000;
        if (age < 0 || age >= duration + Number(row.MaxLife) / 1000) return;
        const count = Number(row.ParticleCount);
        for (let i = 0; i < count; i++) {
          const pose = particle(
            `inferno:${id}:${tick}:${hit.slot}:${emitterIndex}:${i}`,
            name,
            rows,
            age - (duration * i) / count,
            origin,
            (randomSlot) =>
              visualRandom(
                Number(id),
                tick,
                hit.slot * 100000 + emitterIndex * 1000 + i * 16 + randomSlot,
              ),
            effect.IsoLayer ?? effects[0].IsoLayer,
            false,
          );
          if (pose) result.push(pose);
        }
      });
    }
  for (const [id, state] of Object.entries(battle.infernos ?? {}))
    for (const event of state.transitions ?? []) {
      const name = event.stage === 1 ? 'DarkRay Up2' : 'DarkRay Up3';
      const tick = Math.round((event.at * 1000) / 64);
      const pose = particle(
        `inferno:${id}:transition:${tick}:${event.slot}`,
        name,
        emitters[name],
        battle.elapsed - event.at,
        iso(event.x, event.y),
        (slot) => visualRandom(Number(id), tick, 2000000 + event.slot * 16 + slot),
        'Objects',
        false,
      );
      if (pose) result.push(pose);
    }
  return result;
}
