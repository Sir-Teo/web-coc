import source from '../../reference/archer-tower/native.json';
import { ARCHER_TOWER_GRAPH } from './archer-tower-art';
import { nativeParticleSampler, type NativeParticlePose } from './native-particles';
import { visualRandom } from './visual-random';
import type { ArcherTowerHandlingEvent } from './archer-tower-sounds';
const emitters = Object.fromEntries(
  Object.entries(source.particles).map(([name, rows]) => [
    name,
    rows.map((row) => ({ ...rows[0], ...row }) as Record<string, string>),
  ]),
);
const particle = nativeParticleSampler(ARCHER_TOWER_GRAPH, 1.2);

/** Original handling emitters using the shared local particle-motion interpretation. */
export function archerTowerHandlingPoses(
  events: readonly ArcherTowerHandlingEvent[],
  elapsed: number,
  reduced: boolean,
  iso: (x: number, y: number) => { x: number; y: number },
): NativeParticlePose[] {
  if (reduced) return [];
  const result: NativeParticlePose[] = [];
  for (const event of events) {
    const effects = source.effects[
      event.kind === 'pickup' ? 'Tower Turret Pickup' : 'Tower Turret Placing'
    ] as Record<string, string>[];
    effects.forEach((effect, emitterIndex) => {
      const name = effect.ParticleEmitter,
        rows = emitters[name],
        row = rows[0];
      const age = elapsed - event.at - Number(effect.EmitterDelayMs ?? 0) / 1000;
      const duration = Number(row.EmissionTime) / 1000,
        count = Number(row.ParticleCount);
      if (age < 0 || age >= duration + Number(row.MaxLife) / 1000) return;
      for (let i = 0; i < count; i++) {
        const pose = particle(
          `archer-tower:handling:${event.id}:${event.index}:${emitterIndex}:${i}`,
          name,
          rows,
          age - (duration * i) / count,
          iso(event.x, event.y),
          (slot) =>
            visualRandom(event.id, event.index, 5000000 + emitterIndex * 1000 + i * 16 + slot),
          effect.IsoLayer ?? effects[0].IsoLayer,
          false,
        );
        if (pose) result.push(pose);
      }
    });
  }
  return result;
}
