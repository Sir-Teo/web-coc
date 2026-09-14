import source from '../../reference/garrison/sounds.json' with { type: 'json' };
import type { Battle } from './model';
import type { SampleCue } from './sample-audio';
import { garrisonStats } from './garrison-reserve';

export const GARRISON_SOUNDS = source.sounds;
export const garrisonSample = (path: string) => `garrison-${path.split('/').at(-1)}`;
/** Stable local pitch selection within each original effect's range, including after seeks. */
function fraction(key: string) {
  let seed = 2166136261;
  for (const c of key) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
  return (seed >>> 0) / 0xffffffff;
}
export function garrisonSoundCues(battle: Battle | null): SampleCue[] {
  const cues: SampleCue[] = [];
  const effect = (name: string, key: string, at: number) => {
    const rows = source.effects[name as keyof typeof source.effects] as Record<string, string>[];
    for (const [index, row] of rows.entries()) {
      if (!row.Sound) continue;
      const id = `${key}:${index}`;
      const min = Number(row.MinPitch),
        max = Number(row.MaxPitch);
      cues.push({
        key: id,
        sample: garrisonSample(row.Sound),
        at: at + Number(row.SoundDelay) / 1000,
        volume: Number(row.Volume) / 100,
        pitch: (min + (max - min) * fraction(id)) / 100,
      });
    }
  };
  for (const defender of battle?.defenders ?? []) {
    if (defender.kind === 'skeleton') continue;
    // Dragon levels share the Dragon effect rows; later families' original sounds are pending.
    const binding = (source.bindings as Partial<Record<string, (typeof source.bindings)['dragon']>>)[
      defender.kind
    ];
    if (!binding) continue;
    const key = `garrison:${defender.id}`;
    effect(binding.deploy, `${key}:deploy`, defender.spawnedAt);
    for (const [index, attack] of defender.attacks.entries()) {
      effect(binding.attack, `${key}:attack:${index}`, attack.at);
      effect(binding.hit, `${key}:hit:${index}`, attack.at);
    }
    if (defender.defeatedAt !== undefined) {
      effect(binding.die, `${key}:die`, defender.defeatedAt);
      if (defender.kind === 'balloon' && defender.deathResolved)
        effect(
          source.bindings.balloon.deathDamage,
          `${key}:death-damage`,
          defender.defeatedAt + garrisonStats(defender.kind, defender.level).deathDelay,
        );
    }
  }
  return cues;
}
