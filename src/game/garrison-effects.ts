import raw from '../../reference/garrison/particles.json';
import art from '../../reference/garrison/particle-art.json';
import type { NativeMeshGraph } from './native-mesh';
import { nativeParticleSampler, type NativeParticlePose } from './native-particles';
import { visualRandom } from './visual-random';
import { GARRISON_SCALE } from './garrison-poses';
import { garrisonStats } from './garrison-reserve';
import type { Battle } from './model';

type Row = Record<string, string>;
export const GARRISON_EFFECT_GRAPH = art as unknown as NativeMeshGraph;
const effects = raw.effects as Record<string, Row[]>;
// Variant rows share emitter settings; keep the imported records untouched.
const emitters = Object.fromEntries(
  Object.entries(raw.particles).map(([name, rows]) => [
    name,
    rows.map((row) => ({ ...rows[0], ...row }) as Row),
  ]),
);
const number = (row: Row, key: string) => Number(row[key] ?? 0);
const particle = nativeParticleSampler(GARRISON_EFFECT_GRAPH, GARRISON_SCALE, {
  reducedEmitters: ['Ring'],
  signedSpeed: true,
  directionalRadius: true,
  orientTravelToParent: true,
});

/** Original emitters with the shared local particle projection and deterministic births. */
export function garrisonImpactPoses(
  battle: Battle | null,
  reduced: boolean,
  iso: (x: number, y: number) => { x: number; y: number },
): NativeParticlePose[] {
  if (!battle) return [];
  const result: NativeParticlePose[] = [];
  const effect = (
    id: number,
    index: number,
    event: string,
    name: string,
    at: number,
    x: number,
    y: number,
  ) => {
    const rows = effects[name];
    for (const [emitterIndex, effectRow] of rows.entries()) {
      const name = effectRow.ParticleEmitter;
      if (!name) continue;
      const emitter = emitters[name],
        row = emitter[0];
      const age = battle.elapsed - at - number(effectRow, 'EmitterDelayMs') / 1000;
      const duration = number(row, 'EmissionTime') / 1000;
      if (age < 0 || age >= duration + number(row, 'MaxLife') / 1000) continue;
      const count = number(row, 'ParticleCount');
      for (let i = 0; i < count; i++) {
        const pose = particle(
          `garrison:${id}:${event}:${index}:${emitterIndex}:${i}`,
          name,
          emitter,
          age - (duration * i) / count,
          iso(x, y),
          (slot) => visualRandom(id, index, 1000000 + emitterIndex * 1000 + i * 16 + slot),
          effectRow.IsoLayer ?? rows[0].IsoLayer,
          reduced,
        );
        if (pose) result.push(pose);
      }
    }
  };
  for (const defender of battle.defenders ?? []) {
    if (defender.kind !== 'balloon' || battle.elapsed < defender.spawnedAt) continue;
    for (const [index, attack] of defender.attacks.entries())
      effect(defender.id, index, 'hit', raw.bindings.balloon.hit, attack.at, attack.x, attack.y);
    if (defender.defeatedAt !== undefined && defender.deathResolved)
      effect(
        defender.id,
        0,
        'death-damage',
        raw.bindings.balloon.deathDamage,
        defender.defeatedAt + garrisonStats('balloon', defender.level).deathDelay,
        defender.x,
        defender.y,
      );
  }
  return result;
}
