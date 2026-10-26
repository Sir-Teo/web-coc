import type { Battle } from './model';
import { randomPoint, type NativeSpellCast } from './native-spells';
import type { NativeEffectEvent } from './native-effects';
export interface SpellEffectProfile {
  level: number;
  deploySeconds: number;
  PreDeployEffect: string;
  DeployEffect: string;
  DeployEffect2?: string;
  HitEffect?: string;
  hitRadiusTiles?: number;
  graphicsOnlyRadius?: boolean;
}
/** Source deployment art is independent of the later combat pulse; sampling never changes a cast. */
export function spellCastEffectEvents(
  casts: readonly NativeSpellCast[],
  elapsed: number,
  profiles: readonly SpellEffectProfile[],
  iso: (x: number, y: number) => { x: number; y: number },
  duration: (name: string) => number | undefined,
  nestedTimelines = false,
  pulsePresentation = false,
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
      if (!effect || elapsed + 1e-9 < at || elapsed - at > (duration(effect) ?? 30)) continue;
      events.push({
        key: `spell:${cast.id}:${phase}`,
        effect,
        at,
        ground,
        depth: ground.y + 2,
        sampleAt: Math.max(elapsed, at),
        ...(nestedTimelines ? { nestedTimelines: true as const } : {}),
      });
    }
    if (pulsePresentation && row.HitEffect && row.graphicsOnlyRadius) {
      const effect = row.HitEffect,
        tail = duration(effect) ?? 3,
        interval = Math.max(0.001, cast.interval),
        first = Math.max(0, Math.ceil((elapsed - tail - cast.firstHit - 1e-9) / interval));
      // The cast already retains resolved pulse counts and its seed. Sampling consumes no RNG.
      for (let i = first; i < Math.min(cast.hits, cast.total); i++) {
        const at = cast.firstHit + i * interval;
        if (elapsed + 1e-9 < at || elapsed - at > tail) continue;
        const point = randomPoint(cast, i, row.hitRadiusTiles ?? 0),
          ground = iso(point.x, point.y);
        events.push({
          key: `spell:${cast.id}:hit:${i}`,
          effect,
          at,
          ground,
          depth: ground.y + 2,
          sampleAt: Math.max(elapsed, at),
          ...(nestedTimelines ? { nestedTimelines: true as const } : {}),
        });
      }
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
    battle.nativeSpellEffectTimelines,
    battle.nativeSpellPulsePresentation,
  );
}
