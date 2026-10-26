import type { Battle } from './model';
import type { NativeSpellCast } from './native-spells';
import type { NativeEffectEvent } from './native-effects';
export interface SpellEffectProfile {
  level: number;
  deploySeconds: number;
  PreDeployEffect: string;
  DeployEffect: string;
  DeployEffect2: string;
}
/** Source deployment art is independent of the later combat pulse; sampling never changes a cast. */
export function spellCastEffectEvents(
  casts: readonly NativeSpellCast[],
  elapsed: number,
  profiles: readonly SpellEffectProfile[],
  iso: (x: number, y: number) => { x: number; y: number },
  duration: (name: string) => number | undefined,
): (NativeEffectEvent & { sampleAt: number })[] {
  const events: (NativeEffectEvent & { sampleAt: number })[] = [];
  for (const cast of casts) {
    const row = profiles.find((r) => r.level === cast.level);
    if (!row) continue;
    const ground = iso(cast.x, cast.y);
    for (const [phase, effect, at] of [
      ['preDeploy', row.PreDeployEffect, cast.castAt],
      ['deploy', row.DeployEffect, cast.castAt + row.deploySeconds],
      ['deploy2', row.DeployEffect2, cast.castAt + row.deploySeconds],
    ] as const) {
      if (elapsed + 1e-9 < at || elapsed - at > (duration(effect) ?? 30)) continue;
      events.push({
        key: `spell:${cast.id}:${phase}`,
        effect,
        at,
        ground,
        depth: ground.y + 2,
        sampleAt: Math.max(elapsed, at),
      });
    }
  }
  return events;
}

/** Only names enabled by this recording use the additional captured history. */
export function capturedSpellEffectEvents(
  battle: Battle | null,
  name: string,
  profiles: readonly SpellEffectProfile[],
  iso: (x: number, y: number) => { x: number; y: number },
  reduced: boolean,
  duration: (name: string) => number | undefined,
) {
  if (!battle?.nativeSpellArt?.includes(name) || reduced) return [];
  return spellCastEffectEvents(
    battle.nativeSpellCastHistory?.filter((cast) => cast.name === name) ?? [],
    battle.elapsed,
    profiles,
    iso,
    duration,
  );
}
